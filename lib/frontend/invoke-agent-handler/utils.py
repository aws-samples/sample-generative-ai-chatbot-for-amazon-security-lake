import os
import json
import boto3

websocket_callback_url = os.environ.get('WEBSOCKET_CALLBACK_URL')

websocket_client = boto3.client(
    'apigatewaymanagementapi', endpoint_url=websocket_callback_url)


def post_to_websocket(connection_id, message_id, message_type, text=""):
    websocket_client.post_to_connection(
        ConnectionId=connection_id,
        Data=json.dumps({
            "messageId": message_id,
            "type": message_type,
            "text": text,
        })
    )
