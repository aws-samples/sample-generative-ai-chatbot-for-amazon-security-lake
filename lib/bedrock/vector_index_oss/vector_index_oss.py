import os
import json
import boto3
from opensearchpy import OpenSearch, RequestsHttpConnection
from requests_aws4auth import AWS4Auth
import re

def lambda_handler(event, context):
    host_https = event['OPENSEARCH_HTTPS_ENDPOINT']
    index_name = event['INDEX_NAME']
    region = os.environ['AWS_REGION']

    host = re.sub(r"https?://", "", host_https)

    service = 'aoss'
    credentials = boto3.Session().get_credentials()
    awsauth = AWS4Auth(credentials.access_key, credentials.secret_key, region, service, session_token=credentials.token)

    client = OpenSearch(
        hosts=[{'host': host, 'port': 443}],
        http_auth=awsauth,
        use_ssl=True,
        verify_certs=True,
        connection_class=RequestsHttpConnection
    )

    index_body = {
        'settings': {"index": {"knn": True}},
        "mappings": {
            "properties": {
                "bedrock-knowledge-base-default-vector": {
                    "type": "knn_vector",
                    "dimension": 1536,
                    "method": {
                        "name": "hnsw",
                        "engine": "faiss",
                        "parameters": {"ef_construction": 512, "m": 16},
                        "space_type": "l2",
                    },
                },
                "AMAZON_BEDROCK_METADATA": {"type": "text", "index": "false"},
                "AMAZON_BEDROCK_TEXT_CHUNK": {"type": "text", "index": "true"},
                "id": {"type": "text", "index": "true"},
                "x-amz-bedrock-kb-data-source-id": {"type": "text", "index": "true"},
                "x-amz-bedrock-kb-source-uri": {"type": "text", "index": "true"},
            }
        }
    }

    try:
        response = client.indices.create(index_name, body=index_body)
        print(f'Index created: {json.dumps(response)}')
        return {
            'statusCode': 200,
            'body': json.dumps('Vector index created successfully')
        }
    except Exception as e:
        print(f'Error creating index: {str(e)}')
        return {
            'statusCode': 500,
            'body': json.dumps(f'Error creating vector index: {str(e)}')
        }
