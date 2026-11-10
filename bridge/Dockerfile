FROM node:22-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787
RUN apk add --no-cache ffmpeg
WORKDIR /app
COPY --chown=node:node server.cjs hls.cjs remux.cjs self-update.cjs launcher.cjs ./
USER node
EXPOSE 8787
CMD ["node","launcher.cjs"]
