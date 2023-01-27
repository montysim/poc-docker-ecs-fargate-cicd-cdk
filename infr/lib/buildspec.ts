
/**
 * Variables accessed here via $ must be declared in 
 * the stack codebuild.Project.environmentVariables
 */
export const buildspec = {
  version: "0.2",
  phases: {
    pre_build: {
      commands: [
        'env',
        'export tag=latest'
      ]
    },
    build: {
      // 'run-as': 'verisim',
      // 'on-failure': 'ABORT',
      commands: [
        'cd docker-app',
        'docker build --target test .',
        `docker build -t $ecr_repo_uri:$tag --target prod .`,
        '$(aws ecr get-login --no-include-email)',
        'docker push $ecr_repo_uri:$tag'
      ]
    },
    post_build: {
      commands: [
        'echo "in post-build stage"',
        'cd ..',
        "printf '[{\"name\":\"docker-app\",\"imageUri\":\"%s\"}]' $ecr_repo_uri:$tag > imagedefinitions.json",
        "pwd; ls -al; cat imagedefinitions.json"
      ]
    }
  },
  artifacts: {
    files: [
      'imagedefinitions.json'
    ]
  },
  reports: {
    pytest_reports: {
      files: [
        'unit-test'
      ],
      'base-directory': 'reports',
      'file-format': 'JUNITXML'
    }
  }
}