'use strict';

const Srf = require('drachtio-srf');
const fetch = require('node-fetch');
const debug = require('debug')('app');

const srf = new Srf();

const DRACHTIO_HOST = process.env.DRACHTIO_HOST || 'drachtio.voip-test.svc.cluster.local';
const DRACHTIO_PORT = process.env.DRACHTIO_PORT || 9022;
const DRACHTIO_SECRET = process.env.DRACHTIO_SECRET || 'cymru';

const RTPENGINE_HOST = process.env.RTPENGINE_HOST || 'rtpengine.voip-test.svc.cluster.local';
const RTPENGINE_PORT = process.env.RTPENGINE_PORT || 22222;
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

srf.invite(async (req, res) => {
  try {
    debug('INVITE from %s', req.source_address);
    const inboundSdp = req.body || '';

    // Simple rtpengine "offer" via HTTP-like API if available.
    // Many rtpengine builds expect UDP NG protocol; adapt as per your rtpengine build.
    // Here we only simulate the flow: we will forward invite with original SDP to FreeSWITCH.
    // In a production setup you must call rtpengine's control API to allocate ports and get modified SDP.

    // Proxy to FreeSWITCH
    const uac = await srf.createUAC(FREESWITCH_TARGET, {
      method: 'INVITE',
      body: inboundSdp,
      headers: {
        'X-Forwarded-For': req.source_address
      }
    });

    uac.on('response', async (uacRes) => {
      if (uacRes.status === 200) {
        const answerSdp = uacRes.body || '';
        // TODO: call rtpengine.answer here and return SDP from rtpengine
        await res.send(200, { body: answerSdp });
      } else {
        // relay provisional or error
        await res.send(uacRes.status, uacRes.reason);
      }
    });

  } catch (err) {
    console.error('Invite handling error', err);
    try { await res.send(500); } catch (e) {}
  }
});

process.on('SIGINT', () => process.exit(0));
