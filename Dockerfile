FROM node:alpine

WORKDIR /app
ENV CLICMD /app/bin/run
RUN chown node:node /app
RUN cd /usr/local/bin && ln -s $CLICMD gameon

EXPOSE 8080
EXPOSE 8181

RUN apk --no-cache add python3 build-base

COPY package.json .
COPY package-lock.json .
#COPY scripts scripts

RUN --mount=type=secret,id=npmrc,dst=/app/.npmrc npm install --omit dev
#RUN npm run compile

COPY --chown=node:node . .
RUN rm -rf .git

USER node

CMD gameon
#server