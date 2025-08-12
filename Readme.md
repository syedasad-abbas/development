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
  





   
        

          