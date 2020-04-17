FROM node:alpine

EXPOSE 8080

WORKDIR /usr/local/share/gameon

COPY package.json .

RUN npm install

COPY . .

RUN npm install -g .

CMD gameon server