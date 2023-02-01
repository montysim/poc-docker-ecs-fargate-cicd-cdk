export const publishBuildSpec = {
    version: '0.2',
    phases: {
      install: {
        commands: [
          'echo Entered the install phase...',
          'curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"',
          'unzip -q awscliv2.zip',
          './aws/install',
          'pip3 install twine',
        ],
      },
      pre_build: {
        commands: [
          'echo Entered the pre_build phase...',
          '/usr/local/bin/aws --version',
          '/usr/local/bin/aws sts get-caller-identity',
        ],
      },
      build: {
        commands: [
          'echo Entered the build phase...',
          'echo Package Publishing to CodeArtifact in ${region} started on `date`',
          '/usr/local/bin/aws codeartifact login --tool twine --domain ${domainName} --domain-owner ${domainOwner} --repository ${repositoryName} --region ${region}',
          'python3 -m twine upload --skip-existing --repository codeartifact ${buildPath} --verbose',
        ],
      },
      post_build: {
        command: ['echo Package Publishing completed on `date`'],
      },
    },
  };