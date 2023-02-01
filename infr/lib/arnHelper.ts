import { Arn, Stack } from 'aws-cdk-lib';
import {
  config
} from '../bin/envConfig';

/*
  Add a helper function to iterate through all relevant codeartifact resources and return them in an array
*/
export const generateCodeArtifactArns = (stack: Stack, domainName: string, repoName: string): string[] => {
  // hold the list of arns in an array called codeArtifactArns
  var codeArtifactArns: string[] = [];

  // TODO: iterate through each region to derive each resource Arn
  for (var region of [config.region]) {
    //Arn for the repository
    const codeArtifactRepoArn = Arn.format(
      {
        service: 'codeartifact',
        resource: 'repository',
        region,
        resourceName: `${domainName}/${repoName}`,
      },
      stack
    );

    //Arn for the domain
    const codeArtifactDomainArn = Arn.format(
      {
        service: 'codeartifact',
        resource: 'domain',
        region,
        resourceName: domainName,
      },
      stack
    );

    //Arn for the packages
    const packageArn = Arn.format(
      {
        service: 'codeartifact',
        resource: 'package',
        region,
        resourceName: `${domainName}/${repoName}/*`,
      },
      stack
    );

    //add the Arns to the array
    codeArtifactArns.push(codeArtifactRepoArn);
    codeArtifactArns.push(codeArtifactRepoArn + '/*');
    codeArtifactArns.push(codeArtifactDomainArn);
    codeArtifactArns.push(packageArn);
  }

  //return the array of CodeArtifactArns
  return codeArtifactArns;
};