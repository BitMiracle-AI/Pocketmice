# The image of the web app. The pages are built into static files, and nginx hands them out on port 11211. A reverse
# proxy outside the container takes the requests from outside and passes them on.
# The build context is the root of the repository, because pnpm's lockfile and packages/ are there:
#   docker build -f apps/app/Dockerfile --build-arg VITE_API_URL=https://api.example.com .
# VITE_API_URL is the address of the api as browsers reach it. Vite writes it into the pages when they are built
# (see .env.example), so an image talks to that one api, and every environment has an image of its own. Without it
# the build fails. Nothing is configured when the container runs.
#
# Two stages: the first builds the pages, the second takes only the files that came out.

FROM node:26-alpine AS build
WORKDIR /repo

# Where packages are downloaded from: the official registry unless the build names another. A build machine that
# reaches the official one slowly names a mirror:
#   docker build --build-arg NPM_REGISTRY=https://registry.npmmirror.com -f apps/app/Dockerfile .
# npm, which installs pnpm, and pnpm each read a variable of their own.
ARG NPM_REGISTRY=https://registry.npmjs.org
ENV npm_config_registry=$NPM_REGISTRY pnpm_config_registry=$NPM_REGISTRY

# The version of pnpm is written in one place, packageManager in the root package.json
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN npm install --global "$(node --print "require('./package.json').packageManager")"

# All of packages/, not one by one: a new package needs no change here. tsconfig.base.json is what the app's own
# tsconfig.json builds on
COPY tsconfig.base.json ./
COPY packages packages
COPY apps/app apps/app
# Only what the app and the packages it uses need, the tools that build it included.
# What is downloaded is kept in the build machine's cache (--mount=type=cache) and in no layer of the image: when
# the code changes this step runs again, without downloading again
RUN --mount=type=cache,target=/pnpm-store \
  pnpm install --frozen-lockfile --filter @pocketmice/app... --store-dir /pnpm-store

# After the install: another address builds the pages again and installs nothing again. A build argument is in the
# environment of the steps that follow it, which is where Vite looks
ARG VITE_API_URL
RUN pnpm --filter @pocketmice/app build

FROM nginx:alpine
# The nginx image has two sample pages (index.html, 50x.html) in the folder the pages go to. They are removed: or
# /50x.html would be handed out
RUN rm -rf /usr/share/nginx/html/*
COPY apps/app/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/app/dist /usr/share/nginx/html
EXPOSE 11211

# Healthy when nginx answers with the first page. Without this a new container counts as ready the moment it
# starts, when nginx may not be listening yet, and requests sent to it then get no answer
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --start-interval=1s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:11211/ || exit 1
