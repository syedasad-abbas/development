'use strict';

// Simple user database (can be replaced with DB)
const users = {
  "1000": "1234",
  "1001": "1234"
};

const Srf = require('drachtio-srf');
const dgram = require('dgram');
const debug = require('debug')('app');

const srf = new Srf();

const DRACHTIO_HOST = process.env.DRACHTIO_HOST || 'drachtio.voip-test.svc.cluster.local';
const DRACHTIO_PORT = Number(process.env.DRACHTIO_PORT) || 9022;
const DRACHTIO_SECRET = process.env.DRACHTIO_SECRET || 'cymru';

const RTPENGINE_HOST = process.env.RTPENGINE_HOST || 'rtpengine.voip-test.svc.cluster.local';
const RTPENGINE_PORT = Number(process.env.RTPENGINE_PORT) || 22222;

const FREESWITCH_TARGET = process.env.FREESWITCH_TARGET || 'sip:freeswitch.voip-test.svc.cluster.local:5060';

srf.connect({
  host: DRACHTIO_HOST,
  port: DRACHTIO_PORT,
  secret: DRACHTIO_SECRET
});

srf.on('connect', (hp) => {
  console.log('Connected to drachtio server at', hp);
});

srf.on('error', (err) => {
  console.error('Drachtio connection error', err);
  process.exit(1);
});
// ------------------- ADD THIS PART BELOW -------------------
// REGISTER handler to allow SIP clients (Zoiper/SIPP) to register
srf.register(async (req, res) => {
  try {
    const username = req.authorization.username;
    const password = req.authorization.password;

    if (!username || !password || users[username] !== password) {
      console.log(`Invalid registration attempt: ${username}`);
      await res.send(401, 'Unauthorized');
      return;
    }

    console.log(`User ${username} registered from ${req.source_address}`);
    await res.send(200, 'OK');
  } catch (err) {
    console.error('Register handling error', err);
    try { await res.send(500); } catch (e) {}
  }
});
// ------------------- END OF UPDATED PART -------------------


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

    const sdpBase64 = Buffer.from(inboundSdp).toString('base64');
    const offerCommand = `offer call-id=${callId} from-tag=${fromTag} sdp=${sdpBase64} replace-origin replace-session-connection`;

    const offerResponse = await sendRtpengineCommand(offerCommand, RTPENGINE_HOST, RTPENGINE_PORT);

    if (!offerResponse.startsWith('200 OK')) {
      throw new Error('RTPengine offer error: ' + offerResponse);
    }

    const sdpPart = offerResponse.split('sdp=')[1];
    if (!sdpPart) throw new Error('No SDP in RTPengine offer response');
    const modifiedSdp = Buffer.from(sdpPart.trim(), 'base64').toString();

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

        const answerSdpBase64 = Buffer.from(answerSdp).toString('base64');
        const answerCommand = `answer call-id=${callId} from-tag=${fromTag} to-tag=${toTagAnswer} sdp=${answerSdpBase64} replace-origin replace-session-connection`;

        const answerResponse = await sendRtpengineCommand(answerCommand, RTPENGINE_HOST, RTPENGINE_PORT);

        if (!answerResponse.startsWith('200 OK')) {
          throw new Error('RTPengine answer error: ' + answerResponse);
        }

        const ansSdpPart = answerResponse.split('sdp=')[1];
        if (!ansSdpPart) throw new Error('No SDP in RTPengine answer response');
        const modifiedAnswerSdp = Buffer.from(ansSdpPart.trim(), 'base64').toString();

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
