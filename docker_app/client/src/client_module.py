import requests

def is_service_up():
    # url = 'http://localhost:8001'
    url = 'http://internal-CfnCC-Farga-1D1GEV4DOFB2Q-1744603618.us-west-1.elb.amazonaws.com:80'
    res = requests.get(url)

    response = 'UP'
    if ('UP and CONNECTED' in res.text):
        response = 'UP and WELL CONNECTED'
    elif ('UP' in res.text):
        response = 'UP and CONNECTED'

    return response