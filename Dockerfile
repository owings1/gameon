FROM node:alpine

EXPOSE 8080

ENV CLICMD /usr/local/share/gameon/bin/run
WORKDIR /usr/local/share/gameon
RUN chown node:node /usr/local/share/gameon
RUN cd /usr/local/bin && ln -s $CLICMD gameon

USER node

COPY package.json .
COPY package-lock.json .
COPY scripts scripts

RUN npm install

COPY --chown=node:node . .
RUN rm -rf .git

CMD gameon server