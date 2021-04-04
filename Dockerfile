FROM node:alpine

WORKDIR /usr/local/share/gameon
ENV CLICMD /usr/local/share/gameon/bin/run
RUN chown node:node /usr/local/share/gameon
RUN cd /usr/local/bin && ln -s $CLICMD gameon

EXPOSE 8080
EXPOSE 8181

RUN apk --no-cache add python3 build-base

COPY package.json .
COPY package-lock.json .
COPY scripts scripts

RUN npm install

COPY --chown=node:node . .
RUN rm -rf .git

USER node

CMD gameon server