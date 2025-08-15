1.created a cluster named voip cluster as follows
# create cluster (adjust --agents/--servers or api-port as you like)
k3d cluster create voip-cluster \
  --servers 1 --agents 1 \
  -p "5060:5060/udp@server:0" \
  -p "5061:5061/tcp@server:0" \
  -p "8021:8021/tcp@server:0" \
  -p "12222:12222/udp@server:0" \
  -p "22222:22222/tcp@server:0" \
  -p "30000-30010:30000-30010/udp@server:0" \
  --wait
  # updated cluster command 
  `k3d cluster create voip-cluster \
  --servers 1 --agents 1 \
  --api-port 127.0.0.1:6443 \
  -p "5060:5060/udp@server:0" \
  -p "5061:5061/tcp@server:0" \
  -p "8021:8021/tcp@server:0" \
  -p "12222:12222/udp@server:0" \
  -p "22222:22222/tcp@server:0" \
  -p "30000-30010:30000-30010/udp@server:0" \
  --wait`
  # inspect the cluster using 
  k3d kubeconfig get voip-cluster > ~/.kube/config


2.created namespaces 
# apiVersion: v1
# kind: Namespace
# metadata:
#   name: voip-test

3.create a directory stracture
~/development/
├── manifests/
│   ├── namespace.yaml
│   ├── freeswitch-deployment.yaml
│   ├── freeswitch-service.yaml
│   ├── rtpengine-deployment.yaml
│   ├── rtpengine-service.yaml
│   ├── drachtio-deployment.yaml
│   ├── drachtio-service.yaml
├── app/            # node app code + Dockerfile
│   ├── package.json
│   ├── app.js
│   └── Dockerfile
└── README.md

4.created the development and  services as follows 
# freeswitch-deployment.yaml
# freeswitch-service.yaml
# rtpengine-deployment.yaml
# rtpengine-service.yaml
# drachtio-deployment.yaml
# drachtio-service.yaml

5.Create ~/voip-k3d/app/package.json

6.Create ~/voip-k3d/app/app.js
7Create ~/voip-k3d/app/Dockerfile
 8.Build and load Node image into k3d
    cd ~/voip-k3d/app
docker build -t my-node-app:latest .
# import into k3d cluster
k3d image import my-node-app:latest -c voip-cluster
---

9.Apply manifests 

10.Build a freeswitch docker image by defining a custom entry point as follows 
# Set entrypoint to the actual freeswitch binary
# ENTRYPOINT ["/usr/local/freeswitch/bin/freeswitch"]
# CMD ["-nonat", "-nf"]
11.build the freeswitch image as follows 

# docker build -t customswitch-app:latest .

12.import the image into the cluster 

# k3d image import customswitch-app:latest -c voip-cluster 

13.define custom entrypoint in the rtp-developmentyaml file for rtpengine image
check the entry point of by login to the container 

        docker run -it jambonz/rtpengine:latest sh
which rtpengine
---
#      spec:
#       containers:
#       - name: rtpengine
#         image: jambonz/rtpengine:latest
#         imagePullPolicy: IfNotPresent
#         command: ["/usr/local/bin/rtpengine"]
#         env:
#           - name: POD_IP
#             valueFrom:
#               fieldRef:
#                 fieldPath: status.podIP
---
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

---
env:
          - name: POD_IP
            valueFrom:
              fieldRef:
                fieldPath: status.podIP
  
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: rtpengine
  namespace: voip-test
spec:
  replicas: 1
  selector:
    matchLabels:
      app: rtpengine
  template:
    metadata:
      labels:
        app: rtpengine
    spec:
      containers:
      - name: rtpengine
        image: jambonz/rtpengine:latest
        imagePullPolicy: IfNotPresent
        command: ["/usr/local/bin/rtpengine"]
        env:
          - name: RTPENGINE_HOST
            value: "rtpengine.voip-test.svc.cluster.local"
          - name: RTPENGINE_PORT
            value: "22222"    
        args:
          - "--interface=eth0/$(POD_IP)"
          - "--listen-ng=22222"
          - "--listen-cli=12222"
          - "--port-min=30000"
          - "--port-max=30010"
          - "--foreground"
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        ports:
          - name: ng
            containerPort: 22222
            protocol: TCP
          - name: cli
            containerPort: 12222
            protocol: UDP
---




   
        

          