FROM node:20-alpine

WORKDIR /app
COPY apps/frontend/package*.json ./
RUN npm install

COPY apps/frontend/ .

ARG VITE_API_URL
ARG VITE_APP_URL
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_APP_URL=$VITE_APP_URL

RUN npm run build

RUN npm install -g serve

ENV PORT=4173
EXPOSE 4173

CMD ["serve", "-s", "dist", "-l", "4173"]
