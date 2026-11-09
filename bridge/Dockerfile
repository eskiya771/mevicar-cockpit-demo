FROM node:22-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787
WORKDIR /app
COPY --chown=node:node server.cjs ./server.cjs
USER node
EXPOSE 8787
CMD ["node","server.cjs"]
