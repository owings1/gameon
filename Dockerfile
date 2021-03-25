FROM node:alpine

EXPOSE 8080

ENV CLICMD /usr/local/share/gameon/bin/run
WORKDIR /usr/local/share/gameon
RUN chown node:node /usr/local/share/gameon
RUN cd /usr/local/bin && ln -s $CLICMD gameon

RUN apk --no-cache add python3 build-base

COPY package.json .
COPY package-lock.json .
COPY scripts scripts

RUN npm install

COPY --chown=node:node . .
RUN rm -rf .git

USER node

CMD gameon server