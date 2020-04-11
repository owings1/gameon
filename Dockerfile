FROM node:alpine

EXPOSE 8080

WORKDIR /usr/local/share/gameon

COPY package.json .

RUN npm install

COPY . .

CMD node src/net/server.js