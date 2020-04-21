FROM node:alpine

RUN apk add git p7zip xz curl perl-utils

WORKDIR /app

RUN chown node:node /app

USER node

COPY --chown=node:node . .

RUN npm install