# The image of the api. The container holds one process, the api, listening on port 11210. A reverse proxy outside
# the container takes the requests from outside and passes them on; what the api counts on that proxy for is in the
# README.
# The build context is the root of the repository, because pnpm's lockfile and packages/ are there:
#   docker build -f apps/api/Dockerfile .
# The configuration (the database, the address people use, where files are kept) comes from the environment when the
# container runs: the list is in .env.example. There is no .env in the image.
# The code is not compiled: Node runs the TypeScript as it is, the same as in development.
#
# The container keeps nothing on its disk: what the files are is in the database, their content in the bucket.
#
# Two stages: the first installs the dependencies, the second takes only the result. pnpm itself and the cache of
# what it downloaded stay in the first.

FROM node:26-alpine AS install
WORKDIR /repo

# Where packages are downloaded from: the official registry unless the build names another. A build machine that
# reaches the official one slowly names a mirror:
#   docker build --build-arg NPM_REGISTRY=https://registry.npmmirror.com -f apps/api/Dockerfile .
# npm, which installs pnpm, and pnpm each read a variable of their own.
ARG NPM_REGISTRY=https://registry.npmjs.org
ENV npm_config_registry=$NPM_REGISTRY pnpm_config_registry=$NPM_REGISTRY

# The version of pnpm is written in one place, packageManager in the root package.json
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN npm install --global "$(node --print "require('./package.json').packageManager")"

# All of packages/, not one by one: a new package needs no change here
COPY packages packages
COPY apps/api apps/api
# Only what the api and the packages it uses need to run.
# What is downloaded is kept in the build machine's cache (--mount=type=cache) and in no layer of the image: when
# the code changes this step runs again, without downloading again
RUN --mount=type=cache,target=/pnpm-store \
  pnpm install --frozen-lockfile --prod --filter @pocketmice/api... --store-dir /pnpm-store

FROM node:26-alpine
COPY --from=install /repo /repo

ENV NODE_ENV=production
# Every address the container has: the proxy is outside the container and cannot reach 127.0.0.1 in it. Who can
# reach the container is for the network around it to limit
ENV HOST=0.0.0.0
EXPOSE 11210

# Not root
USER node
WORKDIR /repo/apps/api

# Healthy when the api answers. It does not ask the database (see /api/health in src/app.ts)
HEALTHCHECK --interval=10s --timeout=3s --start-period=60s --start-interval=1s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT:-11210}/api/health" || exit 1

# First the migrations that have not run yet are applied to the database; if that fails the api does not start.
# Then exec replaces the shell with the api, which from then on gets the signal to stop itself (see main.ts). While
# the migrations run the signal goes to the shell, which ignores it: the container is then ended by force when its
# time to stop runs out
CMD ["sh", "-c", "node src/migrate.ts && exec node src/main.ts"]
