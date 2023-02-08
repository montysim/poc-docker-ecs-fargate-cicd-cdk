import os
import boto3
import urllib3
import re
import json

DEFAULT_HEADERS = {'Content-Type': 'application/json'}
def post(url, payload):
    encoded_data = json.dumps(payload).encode('utf-8')
    http = urllib3.PoolManager()
    http.request('POST', url, headers = DEFAULT_HEADERS, body = encoded_data)
        
def get_test_reports_summary(reportArns = []): 
    if reportArns:
        client = boto3.client('codebuild')
        response = client.batch_get_reports(reportArns = reportArns)

        if response['reports']:
            report = response['reports'][0]
            print("REPORT: ", report)
            
            return '%s with %d failures of %d\n'%(
                    report['status'],
                    # 'successTests': report['testSummary']['statusCounts']['SUCCEEDED'] if report['testSummary']['statusCounts']['SUCCEEDED'] else 0,
                    report['testSummary']['statusCounts']['FAILED'] if report['testSummary']['statusCounts']['FAILED'] else 0,
                    report['testSummary']['total'] if report['testSummary']['total'] else 0,
                )
    return 'No tests reported\n'

# TODO: check existence of testSummary
# TODO: search for 'VSL TESTS FAILED'
    
BUILD_ID_REGEX = '(?<=:build/).*$'
BUILD_URL_TEMPLATE = 'https://{}.console.aws.amazon.com/codesuite/codebuild/projects/{}/build/{}/phase?region={}'
def build_slack_message(message):
    additional_info = message['detail']['additional-information']
    report_summ = get_test_reports_summary(additional_info['reportArns'])
    region = message['region']
    project = message['detail']['project-name']
    buildArn = message['detail']['build-id']
    buildNum = additional_info['build-number']
    build_id = re.search(BUILD_ID_REGEX, buildArn).group()
    build_status = message['detail']['build-status']
    build_url = BUILD_URL_TEMPLATE.format(region, project, build_id, region)

    payload = {
        'username': 'VSL Build Monitor',
        'text': 'New build information',
        'blocks': [
            {
                "type": "section",
                "fields": [
                    {
                        "type": "mrkdwn",
                        "text": "*Status:*\n%s"%(build_status)
                    },
                    {
                        "type": "mrkdwn",
                        "text": "*Project:*\n%s"%(project)
                    }
                ]
            },
            {
                "type": "section",
                "fields": [
                    {
                        "type": "mrkdwn",
                        "text": "*Tests:*\n%s"%(report_summ)
                    }
                ]
            },
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": "*Build*: <%s|%d>"%(build_url, int(buildNum))
                }
            }
	    ]
    }
    return payload

def lambda_handler(event, context):
    message_str = event['Records'][0]['Sns']['Message']
    message = json.loads(message_str)

    print("SNS: ", event)

    print("MSG: ", message)
    print("MSG TYPE: ", type(message))

    slack_msg = build_slack_message(message)

    post(os.getenv('SLACK_HOOK_URL'), slack_msg)

    return {'statusCode': 200}