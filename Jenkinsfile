pipeline {
  agent any
  environment {
    IMAGE = 'ghcr.io/mike-urssu/ming-mang-mong'
  }
  stages {
    stage('Build') {
      steps {
        sh 'docker build -t $IMAGE:$GIT_COMMIT -t $IMAGE:latest .'
      }
    }
    stage('Push') {
      steps {
        withCredentials([usernamePassword(credentialsId: 'ghcr', usernameVariable: 'GHCR_USER', passwordVariable: 'GHCR_TOKEN')]) {
          sh 'echo $GHCR_TOKEN | docker login ghcr.io -u $GHCR_USER --password-stdin'
          sh 'docker push $IMAGE:$GIT_COMMIT && docker push $IMAGE:latest'
        }
      }
    }
    stage('Deploy') {
      steps {
        sh 'docker compose -p ming-mang-mong pull && docker compose -p ming-mang-mong up -d'
      }
    }
  }
}
