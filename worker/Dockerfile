FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --chown=node:node src ./src
COPY --chown=node:node tsconfig.json ./
USER node
ENTRYPOINT ["npx", "tsx"]
