# backend/ai_analyzer.py
import base64
import requests
import json
import re

def ollama_analyze_image(image_path):
    """
    Sends an image to the local Ollama server for analysis and description.
    Returns a dictionary with a generated title and description.
    """
    try:
        # Read and encode the image to base64
        with open(image_path, 'rb') as f:
            image_data = f.read()
        
        encoded_image = base64.b64encode(image_data).decode('utf-8')

        # Correct Ollama API endpoint and payload
        url = "http://localhost:11434/api/generate"
        headers = {"Content-Type": "application/json"}
        payload = {
            "model": "llava",
            "prompt": "You are a professional artist who draw with pens and pencils. Describe the key subjects and mood of this image in one 20-30 words, then create a short, professional title and keep the title very simple english and also keep the english as simple as possible . Respond only with JSON in the format: {'title': '...', 'description': '...'}",
            "images": [encoded_image],
            "stream": False
        }
        
        # Send the request to Ollama
        response = requests.post(url, headers=headers, data=json.dumps(payload))
        response.raise_for_status()

        # Extract the model's output and try to parse it
        model_output_string = response.json().get("response", "{}")

        try:
            # First, try to parse the string as-is
            match = re.search(r'\{.*\}', model_output_string, re.DOTALL)
            if match:
                json_string = match.group(0)
                ai_data = json.loads(json_string)
            else:
                print(f"ERROR: No JSON object found in model response: {model_output_string}")
                return {
                    'title': 'AI Failed to Title',
                    'description': model_output_string.strip() if model_output_string.strip() else 'AI failed to generate a description.'
                }
        except json.JSONDecodeError as e:
            print(f"ERROR: Could not parse JSON from model response: {e}. Raw response: {model_output_string}")
            return {
                'title': 'AI Failed to Title',
                'description': model_output_string.strip() if model_output_string.strip() else 'AI failed to generate a description.'
            }

        return {
            'title': ai_data.get('title', 'Untitled AI Photo'),
            'description': ai_data.get('description', 'An AI-generated description could not be created for this image.')
        }

    except requests.exceptions.RequestException as e:
        print(f"ERROR: Could not connect to Ollama server. Is it running? {e}")
        return {'title': 'AI Server Failed', 'description': 'AI server connection failed.'}
    except Exception as e:
        print(f"ERROR: AI analysis failed: {e}")
        return {'title': 'AI Analysis Error', 'description': 'AI analysis failed due to an unexpected error.'}

