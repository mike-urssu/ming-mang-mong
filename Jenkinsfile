// Pipeline job on main: build the image on the Mac agent, push it to GHCR, deploy it to the server over SSH.
//
// Jenkins setup (shared with the other projects):
//   - Agent labelled 'macbook' runs Docker.
//   - Credentials:
//       ghcr-credentials : Username/Password = GitHub user + classic PAT with write:packages
//       deploy-ssh-key   : SSH private key for the deploy server
//   - Global property DEPLOY_HOST: user@host of the deploy server.
//   - Optional environment DEPLOY_PORT: SSH port of the deploy server (defaults to 22).
// The deploy server pulls with its own read-only GHCR login and has the 'proxy' network Traefik watches.
pipeline {
    agent { label 'macbook' }

    options {
        disableConcurrentBuilds()
        timeout(time: 15, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '20'))
    }

    environment {
        IMAGE = 'ghcr.io/mike-urssu/ming-mang-mong'
        DEPLOY_DIR = '/opt/projects/ming-mang-mong'
    }

    stages {
        stage('Publish image') {
            steps {
                withCredentials([usernamePassword(credentialsId: 'ghcr-credentials',
                        usernameVariable: 'GHCR_USER', passwordVariable: 'GHCR_TOKEN')]) {
                    sh '''
                        # The agent runs as a system daemon without the user's keychain, so Docker's keychain credential
                        # helpers fail (Keychain Error -61). The macOS CLI picks such a helper whenever one is on the PATH,
                        # so run docker with the helpers hidden and a throwaway config; it is removed when the step ends.
                        DOCKER_BIN="$(command -v docker)"
                        docker() { PATH=/usr/bin:/bin:/usr/sbin:/sbin "$DOCKER_BIN" "$@"; }
                        export DOCKER_HOST="$(docker context inspect --format '{{.Endpoints.docker.Host}}')"
                        export DOCKER_CONFIG="$(mktemp -d)"
                        trap 'rm -rf "$DOCKER_CONFIG"' EXIT
                        ln -s "$HOME/.docker/cli-plugins" "$DOCKER_CONFIG/cli-plugins" # buildx
                        echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin
                        docker build --pull --platform linux/arm64 -t "$IMAGE:$GIT_COMMIT" -t "$IMAGE:latest" .
                        docker push "$IMAGE:$GIT_COMMIT"
                        docker push "$IMAGE:latest"
                    '''
                }
            }
        }

        stage('Deploy') {
            steps {
                sshagent(credentials: ['deploy-ssh-key']) {
                    // Pins the server to this build's tag, so a rollback is just an older IMAGE_TAG in release.env.
                    sh '''
                        PORT="${DEPLOY_PORT:-22}"
                        SSH="ssh -p $PORT -o StrictHostKeyChecking=accept-new $DEPLOY_HOST"
                        COMPOSE="docker compose --env-file release.env"

                        $SSH "mkdir -p $DEPLOY_DIR"
                        scp -P "$PORT" -o StrictHostKeyChecking=accept-new compose.yaml "$DEPLOY_HOST:$DEPLOY_DIR/compose.yaml"
                        printf 'IMAGE_TAG=%s\\n' "$GIT_COMMIT" | $SSH "cat > $DEPLOY_DIR/release.env"
                        $SSH "cd $DEPLOY_DIR && $COMPOSE pull && $COMPOSE up -d && docker image prune -af"
                    '''
                }
            }
        }

        // Goes through Traefik, so it also checks the route and the certificate.
        stage('Verify') {
            steps {
                sh '''
                    for i in $(seq 1 30); do
                        code=$(curl -s -o /dev/null -w "%{http_code}" https://ming-mang-mong.jjoon.cloud/)
                        [ "$code" = "200" ] && exit 0
                        sleep 2
                    done
                    echo "app did not become ready (last status: $code)"
                    exit 1
                '''
            }
        }
    }

    post {
        always {
            cleanWs()
        }
    }
}
