FROM node:18-alpine

WORKDIR /usr/src/app

# copy only what's needed for install
COPY package.json ./
RUN npm install --production

# copy your application code
COPY app.js ./

ENV NODE_ENV=production

# this app does not expose any port (it connects out to drachtio)
CMD ["node", "app.js"]
