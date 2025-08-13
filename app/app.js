'use strict';

const Srf = require('drachtio-srf');
const dgram = require('dgram');
const debug = require('debug')('app');

const srf = new Srf();

const DRACHTIO_HOST = process.env.DRACHTIO_HOST || 'drachtio.voip-test.svc.cluster.local';
const DRACHTIO_PORT = Number(process.env.DRACHTIO_PORT) || 9022;
const DRACHTIO_SECRET = process.env.DRACHTIO_SECRET || 'cymru';

const RTPENGINE_HOST = process.env.RTPENGINE_HOST || 'rtpengine.voip-test.svc.cluster.local';
const RTPENGINE_PORT = Number(process.env.RTPENGINE_PORT) || 22222;

const FREESWITCH_TARGET = 'sip:freeswitch.voip-test.svc.cluster.local:5060';

srf.connect({
  host: DRACHTIO_HOST,
  port: DRACHTIO_PORT,
  secret: DRACHTIO_SECRET
});

srf.on('connect', (err, hp) => {
  if (err) {
    console.error('connect error', err);
    process.exit(1);
  }
  console.log('connected to drachtio server at', hp);
});

function sendRtpengineCommand(command, host, port) {
  return new Promise((resolve, reject) => {
    const client = dgram.createSocket('udp4');
    let responseData = '';

    client.on('error', (err) => {
      client.close();
      reject(err);
    });

    client.on('message', (msg) => {
      responseData += msg.toString();
      client.close();
      resolve(responseData);
    });

    client.send(command, port, host, (err) => {
      if (err) {
        client.close();
        reject(err);
      }
    });

    // Timeout if no response in 2 seconds
    setTimeout(() => {
      client.close();
      reject(new Error('RTPengine UDP request timed out'));
    }, 2000);
  });
}

srf.invite(async (req, res) => {
  try {
    debug('INVITE from %s', req.source_address);
    const inboundSdp = req.body || '';
    const callId = req.get('Call-ID');
    const fromTagMatch = req.get('From').match(/tag=([^;>]+)/);
    const fromTag = fromTagMatch ? fromTagMatch[1] : '';
    const toTag = ''; // Empty for initial offer

    // Base64 encode SDP
    const sdpBase64 = Buffer.from(inboundSdp).toString('base64');

    // Build RTPengine offer command
    const offerCommand = `offer call-id=${callId} from-tag=${fromTag} to-tag=${toTag} sdp=${sdpBase64} replace-origin replace-session-connection`;

    debug('Sending offer to RTPengine: %s', offerCommand);

    const offerResponse = await sendRtpengineCommand(offerCommand, RTPENGINE_HOST, RTPENGINE_PORT);

    debug('RTPengine offer response: %s', offerResponse);

    if (!offerResponse.startsWith('200 OK')) {
      throw new Error('RTPengine offer error: ' + offerResponse);
    }

    // Extract modified SDP from response
    const modifiedSdpBase64 = offerResponse.split('sdp=')[1].trim();
    const modifiedSdp = Buffer.from(modifiedSdpBase64, 'base64').toString();

    // Forward INVITE with modified SDP to FreeSWITCH
    const uac = await srf.createUAC(FREESWITCH_TARGET, {
      method: 'INVITE',
      body: modifiedSdp,
      headers: {
        'X-Forwarded-For': req.source_address
      }
    });

    uac.on('response', async (uacRes) => {
      if (uacRes.status === 200) {
        const answerSdp = uacRes.body || '';
        const toTagAnswerMatch = uacRes.get('To').match(/tag=([^;>]+)/);
        const toTagAnswer = toTagAnswerMatch ? toTagAnswerMatch[1] : '';

        // Build RTPengine answer command
        const answerSdpBase64 = Buffer.from(answerSdp).toString('base64');
        const answerCommand = `answer call-id=${callId} from-tag=${fromTag} to-tag=${toTagAnswer} sdp=${answerSdpBase64} replace-origin replace-session-connection`;

        debug('Sending answer to RTPengine: %s', answerCommand);

        const answerResponse = await sendRtpengineCommand(answerCommand, RTPENGINE_HOST, RTPENGINE_PORT);

        debug('RTPengine answer response: %s', answerResponse);

        if (!answerResponse.startsWith('200 OK')) {
          throw new Error('RTPengine answer error: ' + answerResponse);
        }

        const modifiedAnswerSdpBase64 = answerResponse.split('sdp=')[1].trim();
        const modifiedAnswerSdp = Buffer.from(modifiedAnswerSdpBase64, 'base64').toString();

        await res.send(200, { body: modifiedAnswerSdp });
      } else {
        await res.send(uacRes.status, uacRes.reason);
      }
    });

  } catch (err) {
    console.error('Invite handling error', err);
    try { await res.send(500); } catch (e) {}
  }
});

process.on('SIGINT', () => process.exit(0));
