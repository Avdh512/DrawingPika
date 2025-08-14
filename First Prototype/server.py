from flask import Flask, request, send_from_directory, jsonify
from werkzeug.utils import secure_filename
import os
import json
from datetime import datetime
from PIL import Image, ImageOps # Import ImageOps for EXIF handling
import io
import traceback # For detailed error logging

app = Flask(__name__)
UPLOAD_FOLDER = 'photos'
PUBLIC_FOLDER = 'public'
METADATA_FILE = 'photo_metadata.json'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'jfif', 'webp', 'tiff', 'bmp', 'heic'} 

# Ensure folders exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(PUBLIC_FOLDER, exist_ok=True)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def load_metadata():
    """Load photo metadata from JSON file"""
    if os.path.exists(METADATA_FILE):
        try:
            with open(METADATA_FILE, 'r') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError) as e:
            print(f"ERROR: Failed to load metadata from {METADATA_FILE}: {e}")
            return {}
    return {}

def save_metadata(metadata):
    """Save photo metadata to JSON file"""
    try:
        with open(METADATA_FILE, 'w') as f:
            json.dump(metadata, f, indent=2)
        print(f"INFO: Metadata saved to {METADATA_FILE}")
        return True
    except IOError as e:
        print(f"ERROR: Failed to save metadata to {METADATA_FILE}: {e}")
        return False

def organize_photos_by_date(metadata):
    """Organize photos by date for frontend"""
    organized = {}
    for photo_id, photo_data in metadata.items():
        date_key = photo_data['photoDateTime'][:10]  # Extract YYYY-MM-DD
        if date_key not in organized:
            organized[date_key] = []
        organized[date_key].append(photo_data)
    return organized

@app.route('/')
def index():
    return send_from_directory(PUBLIC_FOLDER, 'index.html')

@app.route('/api/photos', methods=['GET'])
def get_photos():
    """Get all photos with metadata"""
    metadata = load_metadata()
    organized_photos = organize_photos_by_date(metadata)
    return jsonify({
        'photos': organized_photos,
        'totalPhotos': len(metadata)
    })

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'image' not in request.files:
        return jsonify({'error': 'No image file provided'}), 400

    file = request.files['image']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    if not allowed_file(file.filename):
        return jsonify({'error': 'Invalid file type'}), 400

    # Get form data
    name = request.form.get('name', 'Untitled Photo')
    date = request.form.get('date', '')
    time = request.form.get('time', '')
    location = request.form.get('location', '')
    description = request.form.get('description', '')

    if not date or not time:
        return jsonify({'error': 'Date and time are required'}), 400

    # Create secure filename
    original_filename = secure_filename(file.filename)
    name_part = secure_filename(name.replace(' ', '_'))
    file_ext = original_filename.rsplit('.', 1)[1].lower()
    
    # Create unique filename with timestamp to avoid conflicts
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S_%f') # Added microseconds for more uniqueness
    filename = f"{name_part}_{timestamp}.{file_ext}"
    
    # Save file
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    try:
        file.save(filepath)
        print(f"INFO: File saved to {filepath}")
    except Exception as e:
        print(f"ERROR: Failed to save file {filepath}: {str(e)}")
        traceback.print_exc()
        return jsonify({'error': f'Failed to save file: {str(e)}'}), 500

    # Create photo metadata
    photo_datetime = f"{date}T{time}:00"
    photo_id = f"{filename}_{datetime.now().timestamp()}"
    
    photo_metadata = {
        'id': photo_id,
        'title': name,
        'fileName': filename,
        'originalName': original_filename,
        'photoDateTime': photo_datetime,
        'location': location,
        'description': description,
        'fileSize': os.path.getsize(filepath),
        'uploadTime': datetime.now().isoformat(),
        'lastModified': datetime.now().isoformat(), # Add lastModified for cache busting
        'rotation': 0  # Default rotation metadata (physical rotation applied by exif_transpose if needed)
    }

    # Load existing metadata and add new photo
    metadata = load_metadata()
    metadata[photo_id] = photo_metadata

    # Save updated metadata
    if save_metadata(metadata):
        return jsonify({
            'message': f'Successfully uploaded {filename}',
            'photoData': photo_metadata
        }), 200
    else:
        # If metadata save fails, remove the uploaded file
        try:
            os.remove(filepath)
            print(f"INFO: Removed uploaded file {filepath} due to metadata save failure.")
        except Exception as e:
            print(f"ERROR: Failed to remove file {filepath} after metadata save error: {e}")
        return jsonify({'error': 'Failed to save photo metadata'}), 500

def rotate_image_file(filepath, rotation_degrees):
    """Physically rotate an image file and save it"""
    print(f"INFO: Attempting to rotate image: {filepath} by {rotation_degrees} degrees.")
    try:
        with Image.open(filepath) as img:
            # Apply EXIF orientation if present before rotating
            # This ensures the image is correctly oriented initially
            img = ImageOps.exif_transpose(img)
            print(f"INFO: Image mode after EXIF transpose: {img.mode}")

            # Convert to RGB if necessary for consistency, especially before saving as JPEG
            # Only convert if not already RGB and not preserving alpha for PNGs
            if img.mode not in ('RGB', 'L', 'CMYK'): # Keep 'L' for grayscale, 'CMYK' for print
                if img.mode == 'RGBA':
                    # If it's RGBA, convert to RGB, filling transparency with white
                    background = Image.new("RGB", img.size, (255, 255, 255))
                    background.paste(img, mask=img.split()[3]) # 3 is the alpha channel
                    img = background
                else:
                    img = img.convert('RGB')
            print(f"INFO: Image mode after color conversion: {img.mode}")

            # Rotate the image (PIL rotates counter-clockwise, so use -rotation_degrees for clockwise)
            rotated_img = img.rotate(-rotation_degrees, expand=True)
            print(f"INFO: Image rotated by {-rotation_degrees} degrees (PIL internal).")
            
            # Determine save format based on original extension
            file_ext = filepath.rsplit('.', 1)[1].lower()
            save_format = 'jpeg' if file_ext in ['jpg', 'jpeg', 'jfif'] else file_ext

            # Save the rotated image back to the same file path
            rotated_img.save(filepath, format=save_format, quality=95, optimize=True)
            print(f"SUCCESS: Successfully saved rotated image to {filepath}")
            return True
    except Exception as e:
        print(f"ERROR: Failed to rotate image {filepath}: {str(e)}")
        traceback.print_exc() # Print full traceback for debugging
        return False

@app.route('/api/update_metadata', methods=['POST'])
def update_metadata():
    """Update photo metadata including rotation"""
    try:
        data = request.get_json()
        if not data:
            print("ERROR: No data provided for update_metadata")
            return jsonify({'error': 'No data provided'}), 400
        
        photo_id = data.get('id')
        if not photo_id:
            print("ERROR: Photo ID is required for update_metadata")
            return jsonify({'error': 'Photo ID is required'}), 400
        
        # Load existing metadata
        metadata = load_metadata()
        
        if photo_id not in metadata:
            print(f"ERROR: Photo with ID {photo_id} not found in metadata.")
            return jsonify({'error': 'Photo not found'}), 404
        
        # Update the metadata fields
        photo_data = metadata[photo_id]
        
        # Handle rotation - if rotation changed, rotate the actual image file
        if 'rotation' in data:
            new_rotation = data['rotation']
            
            # We assume the 'rotation' in metadata is 0 if the image has been physically rotated.
            # The 'new_rotation' from the frontend is the *visual* rotation requested from the current state.
            # So, we physically rotate by this 'new_rotation' amount.
            
            if new_rotation != 0: # Only rotate if a rotation is actually requested
                filepath = os.path.join(app.config['UPLOAD_FOLDER'], photo_data['fileName'])
                
                if os.path.exists(filepath):
                    print(f"INFO: Calling rotate_image_file for {photo_data['fileName']} with rotation {new_rotation}")
                    if rotate_image_file(filepath, new_rotation):
                        photo_data['rotation'] = 0  # Reset rotation to 0 since we physically rotated
                        print(f"INFO: Successfully rotated and reset metadata rotation for {photo_data['fileName']}")
                    else:
                        print(f"ERROR: Failed to rotate image file {photo_data['fileName']}")
                        return jsonify({'error': 'Failed to rotate image file'}), 500
                else:
                    print(f"ERROR: Image file not found at {filepath}")
                    return jsonify({'error': 'Image file not found'}), 404
            else:
                print(f"INFO: No physical rotation needed for {photo_data['fileName']} (new_rotation is 0).")

        # Update other fields if provided
        if 'title' in data:
            photo_data['title'] = data['title']
        if 'photoDateTime' in data:
            photo_data['photoDateTime'] = data['photoDateTime']
        if 'location' in data:
            photo_data['location'] = data['location']
        if 'description' in data:
            photo_data['description'] = data['description']
        
        # Add modification timestamp - this is key for cache busting!
        photo_data['lastModified'] = datetime.now().isoformat()
        print(f"INFO: Updated lastModified for {photo_data['fileName']} to {photo_data['lastModified']}")
        
        # Save updated metadata
        if save_metadata(metadata):
            print(f"INFO: Metadata saved successfully for {photo_data['fileName']}")
            return jsonify({
                'message': 'Photo metadata updated successfully',
                'photoData': photo_data
            }), 200
        else:
            print(f"ERROR: Failed to save metadata for {photo_data['fileName']}")
            return jsonify({'error': 'Failed to save metadata'}), 500
            
    except Exception as e:
        print(f"CRITICAL ERROR in update_metadata: {str(e)}")
        traceback.print_exc()
        return jsonify({'error': f'Server error: {str(e)}'}), 500

@app.route('/delete', methods=['POST'])
def delete_file():
    data = request.get_json()
    if not data or 'filename' not in data:
        return jsonify({'error': 'Filename is required'}), 400

    filename = secure_filename(data['filename'])
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)

    # Remove file from filesystem
    if os.path.exists(filepath):
        try:
            os.remove(filepath)
            print(f"INFO: Physically deleted file: {filepath}")
        except Exception as e:
            print(f"ERROR: Failed to delete file {filepath}: {str(e)}")
            traceback.print_exc()
            return jsonify({'error': f'Failed to delete file: {str(e)}'}), 500
    else:
        print(f"WARNING: Attempted to delete non-existent file: {filepath}")
        # Even if file not found, proceed to remove from metadata if it exists there
        pass 

    # Remove from metadata
    metadata = load_metadata()
    photo_id_to_remove = None
    
    for photo_id, photo_data in metadata.items():
        if photo_data.get('fileName') == filename:
            photo_id_to_remove = photo_id
            break
    
    if photo_id_to_remove:
        del metadata[photo_id_to_remove]
        if save_metadata(metadata):
            print(f"INFO: Removed metadata for {filename}")
        else:
            print(f"ERROR: Failed to remove metadata for {filename}")
            # This is a partial failure, but we still report success for file deletion
            # as the primary request was to delete the file.
            return jsonify({'error': 'File deleted, but failed to update metadata'}), 500
    else:
        print(f"WARNING: Metadata for {filename} not found, nothing to remove.")

    return jsonify({'message': f'Successfully deleted {filename}'}), 200

@app.route('/photos/<path:filename>')
def serve_photo(filename):
    """Serve photos from the photos directory"""
    # This route will automatically handle the cache-busting query parameter
    # and serve the correct file.
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

@app.route('/api/metadata', methods=['GET'])
def get_metadata():
    """Get all photo metadata"""
    metadata = load_metadata()
    return jsonify(metadata)

@app.route('/api/photos/by-date/<date>', methods=['GET'])
def get_photos_by_date(date):
    """Get photos for a specific date"""
    metadata = load_metadata()
    photos = []
    
    for photo_data in metadata.values():
        if photo_data['photoDateTime'][:10] == date:
            photos.append(photo_data)
    
    return jsonify({'photos': photos, 'date': date})

@app.route('/api/stats', methods=['GET'])
def get_stats():
    """Get photo statistics"""
    metadata = load_metadata()
    organized = organize_photos_by_date(metadata)
    
    stats = {
        'totalPhotos': len(metadata),
        'totalDates': len(organized),
        'photosPerDate': {date: len(photos) for date, photos in organized.items()},
        'oldestPhoto': None,
        'newestPhoto': None
    }
    
    if metadata:
        dates = [photo['photoDateTime'] for photo in metadata.values()]
        stats['oldestPhoto'] = min(dates)
        stats['newestPhoto'] = max(dates)
    
    return jsonify(stats)

# Error handler for 404
@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Endpoint not found'}), 404

# Error handler for 500
@app.errorhandler(500)
def internal_error(error):
    print(f"Internal server error: {error}")
    traceback.print_exc() # Print traceback for internal server errors
    return jsonify({'error': 'Internal server error'}), 500

if __name__ == '__main__':
    print(f"Photos will be saved to: {os.path.abspath(UPLOAD_FOLDER)}")
    print(f"Serving from: {os.path.abspath(PUBLIC_FOLDER)}")
    print(f"Metadata file: {os.path.abspath(METADATA_FILE)}")
    app.run(debug=True, port=5000)
