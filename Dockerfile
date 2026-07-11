FROM node:20-alpine

WORKDIR /app
COPY . .

ENV HOST=0.0.0.0 \
    PORT=8787 \
    MARKETING_RUNTIME=demo \
    DATA_DIR=.data

RUN mkdir -p /app/.data && chown -R node:node /app
USER node

EXPOSE 8787
VOLUME ["/app/.data"]

CMD ["node", "server.mjs"]
