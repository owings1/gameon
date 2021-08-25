FROM node:alpine

RUN apk add git p7zip xz curl perl-utils

WORKDIR /app

RUN chown node:node /app

RUN apk --no-cache add python3 build-base

USER node

COPY --chown=node:node . .

RUN npm install
RUN npm run compile
RUN npm run dist && rm -rf tmp