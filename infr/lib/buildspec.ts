
/**
 * Variables accessed here via $ must be declared in 
 * the stack codebuild.Project.environmentVariables
 */
export const buildspec = {
  version: "0.2",
  phases: {
    install: {
      commands: [
        'echo install phase...',
        'python3 -m pip install --upgrade pip',
        'python3 -m pip install --upgrade build'
      ]
    },
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
        'echo build phase...',
        'cd docker_app',

        'echo python dist phase...',
        'cd client',
        'python3 -m build',
        'ls ./dist',
        'cd ..',
        'rm -rf reports/*',

        'echo docker test build phase...',
        // run tests in container and copy reports to ./reports
        'export DOCKER_BUILDKIT=1',
        'docker build --target export-tests . -o ./reports',
        // fail for AWS CodeBuild
        `if (cat reports/unittest.xml | grep Fail); then echo 'VSL TESTS FAILED' && exit 1; fi`,
        'echo VSL TESTS PASSED',
        
        'echo docker build and push phase...',
        `docker build -t $ecr_repo_uri:$tag --target prod .`,
        '$(aws ecr get-login --no-include-email)',
        'docker push $ecr_repo_uri:$tag'
      ],
    },
    post_build: {
      commands: [
        'echo "in post-build stage"',
        'cd ..',
        "printf '[{\"name\":\"docker_app\",\"imageUri\":\"%s\"}]' $ecr_repo_uri:$tag > imagedefinitions.json",
        "pwd; ls -al; cat imagedefinitions.json"
      ]
    }
  },
  artifacts: {
    files: [
      'docker_app/client/dist/*',
      'imagedefinitions.json'
    ]
  },
  reports: {
    pytest_reports: {
      files: [
        'unittest.xml'
      ],
      'base-directory': 'docker_app/reports',
      'file-format': 'JUNITXML'
    }
  }
}