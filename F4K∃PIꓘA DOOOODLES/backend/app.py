# backend/app.py
import sqlite3
from flask import Flask, render_template, g, request, jsonify, send_from_directory, make_response
import os
import uuid
import json 
from datetime import datetime
from werkzeug.utils import secure_filename
from ai_analyzer import ollama_analyze_image 
from PIL import Image, ImageOps 

# Get the absolute path to the directory where this script is located.
basedir = os.path.abspath(os.path.dirname(__file__))

# Database and Uploads Configuration
DATABASE = os.path.join(basedir, 'database.db')
UPLOAD_FOLDER = os.path.join(basedir, 'photos')
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'jfif', 'webp', 'tiff', 'bmp', 'heic'}

# Ensure the uploads folder exists
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Create a Flask web application instance.
app = Flask(__name__, 
            template_folder='../frontend/public', 
            static_folder=os.path.join(basedir, '../frontend/public/static'))

# --- Helper Functions ---

def allowed_file(filename):
    """Checks if the file extension is allowed."""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def get_db():
    """Opens a new database connection for the current application context."""
    db = getattr(g, '_database', None)
    if db is None:
        db = g._database = sqlite3.connect(DATABASE)
        db.row_factory = sqlite3.Row # Allows accessing columns by name
    return db

@app.teardown_appcontext
def close_connection(exception):
    """Closes the database connection at the end of a request."""
    db = getattr(g, '_database', None)
    if db is not None:
        db.close()

def init_db():
    """Initializes the database schema."""
    with app.app_context():
        db = get_db()
        cursor = db.cursor()
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS photos (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                fileName TEXT NOT NULL UNIQUE,
                photoDateTime TEXT NOT NULL,
                location TEXT,
                description TEXT,
                fileSize INTEGER,
                uploadTime TEXT,
                lastModified TEXT,
                originalName TEXT
            )
        ''')
        db.commit()
        print(f"Database initialized and 'photos' table created at: {DATABASE}")

def organize_photos_by_date(photos_list):
    """Organize photos by date for frontend display."""
    organized = {}
    for photo_data in photos_list:
        date_key = photo_data['photoDateTime'][:10]  # Extract YYYY-MM-DD
        if date_key not in organized:
            organized[date_key] = []
        organized[date_key].append(photo_data)
    return organized

def rotate_image_file(filepath, rotation_degrees):
    """Physically rotate an image file and save it."""
    print(f"INFO: Attempting to rotate image: {filepath} by {rotation_degrees} degrees.")
    try:
        with Image.open(filepath) as img:
            # Apply EXIF orientation if present before rotating
            img = ImageOps.exif_transpose(img)
            
            # Convert to RGB if necessary for consistency, especially before saving as JPEG
            if img.mode not in ('RGB', 'L', 'CMYK'):
                if img.mode == 'RGBA':
                    background = Image.new("RGB", img.size, (255, 255, 255))
                    background.paste(img, mask=img.split()[3])
                    img = background
                else:
                    img = img.convert('RGB')

            # Rotate the image (PIL rotates counter-clockwise, so use -rotation_degrees for clockwise)
            rotated_img = img.rotate(-rotation_degrees, expand=True)
            
            # Determine save format based on original extension
            file_ext = filepath.rsplit('.', 1)[1].lower()
            save_format = 'jpeg' if file_ext in ['jpg', 'jpeg', 'jfif'] else file_ext

            rotated_img.save(filepath, format=save_format, quality=95, optimize=True)
            print(f"SUCCESS: Successfully saved rotated image to {filepath}")
            return True
    except Exception as e:
        print(f"ERROR: Failed to rotate image {filepath}: {str(e)}")
        return False

# --- Application Routes ---

@app.route('/')
def home():
    """Renders the home page."""
    return render_template('index.html')

@app.route('/api/upload_single', methods=['POST'])
def upload_single_photo():
    """Handles single photo uploads with user-provided metadata."""
    if 'image' not in request.files:
        return jsonify({'error': 'No image file provided'}), 400

    file = request.files['image']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    if not allowed_file(file.filename):
        return jsonify({'error': 'Invalid file type'}), 400

    # Get form data
    title = request.form.get('name', 'Untitled Photo')
    date = request.form.get('date', '')
    time = request.form.get('time', '')
    location = request.form.get('location', '')
    description = request.form.get('description', '')

    if not date or not time:
        return jsonify({'error': 'Date and time are required'}), 400

    original_filename = secure_filename(file.filename)
    file_ext = original_filename.rsplit('.', 1)[1].lower()
    
    # Create unique filename
    unique_filename = f"{uuid.uuid4()}_{original_filename}"
    filepath = os.path.join(UPLOAD_FOLDER, unique_filename)
    
    try:
        file.save(filepath)
        print(f"INFO: Single file saved to {filepath}")
    except Exception as e:
        print(f"ERROR: Failed to save file {filepath}: {str(e)}")
        return jsonify({'error': f'Failed to save file: {str(e)}'}), 500

    # Create photo metadata
    photo_datetime = f"{date}T{time}:00"
    photo_id = str(uuid.uuid4())
    
    photo_metadata = {
        'id': photo_id,
        'title': title,
        'fileName': unique_filename,
        'originalName': original_filename,
        'photoDateTime': photo_datetime,
        'location': location,
        'description': description,
        'fileSize': os.path.getsize(filepath),
        'uploadTime': datetime.now().isoformat(),
        'lastModified': datetime.now().isoformat()
    }

    # Insert photo metadata into the database
    try:
        db = get_db()
        cursor = db.cursor()
        cursor.execute('''
            INSERT INTO photos (id, title, fileName, photoDateTime, location, description, fileSize, uploadTime, lastModified, originalName)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            photo_metadata['id'],
            photo_metadata['title'],
            photo_metadata['fileName'],
            photo_metadata['photoDateTime'],
            photo_metadata['location'],
            photo_metadata['description'],
            photo_metadata['fileSize'],
            photo_metadata['uploadTime'],
            photo_metadata['lastModified'],
            photo_metadata['originalName']
        ))
        db.commit()
        
        return jsonify({
            'message': f'Successfully uploaded {original_filename}',
            'photoData': photo_metadata
        }), 200
    except sqlite3.Error as e:
        # DO NOT REMOVE FILE HERE: The file needs to persist for display.
        print(f"Database error for single upload: {e}")
        return jsonify({'error': 'Failed to save photo metadata for single upload.'}), 500

@app.route('/api/bulk_upload', methods=['POST'])
def bulk_upload_photos():
    """Handles bulk photo uploads with AI naming."""
    if 'images[]' not in request.files:
        return jsonify({'error': 'No image files provided'}), 400

    files = request.files.getlist('images[]')
    if not files:
        return jsonify({'error': 'No files selected'}), 400

    uploaded_photos_metadata = []
    
    for file in files:
        if file and allowed_file(file.filename):
            original_filename = secure_filename(file.filename)
            unique_filename = f"{uuid.uuid4()}_{original_filename}"
            filepath = os.path.join(UPLOAD_FOLDER, unique_filename)
            
            try:
                file.save(filepath)
                print(f"INFO: Bulk uploaded file saved to {filepath}")

                # Call the Ollama function for analysis
                ai_result = ollama_analyze_image(filepath)

                now = datetime.now()
                photo_id = str(uuid.uuid4())
                
                photo_metadata = {
                    'id': photo_id,
                    'title': ai_result['title'], # AI-generated title
                    'fileName': unique_filename,
                    'originalName': original_filename,
                    'photoDateTime': now.isoformat(),
                    'location': '', # AI might not provide location, leave empty or infer
                    'description': ai_result['description'], # AI-generated description
                    'fileSize': os.path.getsize(filepath),
                    'uploadTime': now.isoformat(),
                    'lastModified': now.isoformat()
                }

                # Insert photo metadata into the database
                db = get_db()
                cursor = db.cursor()
                cursor.execute('''
                    INSERT INTO photos (id, title, fileName, photoDateTime, location, description, fileSize, uploadTime, lastModified, originalName)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    photo_metadata['id'],
                    photo_metadata['title'],
                    photo_metadata['fileName'],
                    photo_metadata['photoDateTime'],
                    photo_metadata['location'],
                    photo_metadata['description'],
                    photo_metadata['fileSize'],
                    photo_metadata['uploadTime'],
                    photo_metadata['lastModified'],
                    photo_metadata['originalName']
                ))
                db.commit()
                
                uploaded_photos_metadata.append(photo_metadata)
                # DO NOT REMOVE FILE HERE: The file needs to persist for display.

            except sqlite3.Error as e:
                print(f"Database error for bulk upload of {original_filename}: {e}")
                # If DB save fails, the file still remains in photos folder.
            except Exception as e:
                print(f"ERROR: Processing bulk uploaded file {original_filename} failed: {str(e)}")
                # If any other error occurs, the file still remains in photos folder.

        else:
            print(f"WARNING: Bulk upload rejected invalid file: {file.filename}")

    if uploaded_photos_metadata:
        return jsonify({
            'message': f'Successfully uploaded and analyzed {len(uploaded_photos_metadata)} photos!',
            'photosData': uploaded_photos_metadata
        }), 200
    else:
        return jsonify({'error': 'No valid files were uploaded or processed successfully'}), 400

@app.route('/api/photos', methods=['GET'])
def get_photos():
    """Get all photos with metadata, organized by date."""
    db = get_db()
    cursor = db.cursor()
    cursor.execute('SELECT * FROM photos ORDER BY photoDateTime DESC')
    photos_list = cursor.fetchall()
    
    # Convert Row objects to dictionaries for JSON serialization
    photos_dicts = [dict(row) for row in photos_list]
    
    organized_photos = organize_photos_by_date(photos_dicts)
    
    response = make_response(jsonify({
        'photos': organized_photos,
        'totalPhotos': len(photos_dicts)
    }))
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

@app.route('/api/update_metadata', methods=['POST'])
def update_photo_metadata():
    """Update photo metadata including rotation."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        photo_id = data.get('id')
        if not photo_id:
            return jsonify({'error': 'Photo ID is required'}), 400
        
        db = get_db()
        cursor = db.cursor()
        
        # Fetch existing photo data to get the filename
        cursor.execute('SELECT * FROM photos WHERE id = ?', (photo_id,))
        photo_data = cursor.fetchone()
        
        if not photo_data:
            return jsonify({'error': 'Photo not found'}), 404
        
        # Update fields
        update_fields = []
        update_values = []

        if 'title' in data:
            update_fields.append('title = ?')
            update_values.append(data['title'])
        if 'photoDateTime' in data:
            update_fields.append('photoDateTime = ?')
            update_values.append(data['photoDateTime'])
        if 'location' in data:
            update_fields.append('location = ?')
            update_values.append(data['location'])
        if 'description' in data:
            update_fields.append('description = ?')
            update_values.append(data['description'])
        
        # Handle rotation - if rotation changed, rotate the actual image file
        if 'rotation' in data and data['rotation'] != 0:
            filepath = os.path.join(UPLOAD_FOLDER, photo_data['fileName'])
            
            if os.path.exists(filepath):
                if rotate_image_file(filepath, data['rotation']):
                    # If physical rotation is done, no need to store rotation in DB
                    pass 
                else:
                    return jsonify({'error': 'Failed to rotate image file'}), 500
            else:
                return jsonify({'error': 'Image file not found'}), 404
        
        # Always update lastModified for cache busting
        update_fields.append('lastModified = ?')
        update_values.append(datetime.now().isoformat())

        if not update_fields: # No fields to update other than lastModified (which is always updated)
            return jsonify({'message': 'No changes detected for photo metadata.'}), 200

        update_query = f"UPDATE photos SET {', '.join(update_fields)} WHERE id = ?"
        update_values.append(photo_id)
        
        cursor.execute(update_query, tuple(update_values))
        db.commit()

        # Fetch updated photo data to return
        cursor.execute('SELECT * FROM photos WHERE id = ?', (photo_id,))
        updated_photo_data = cursor.fetchone()
        
        response = make_response(jsonify({
            'message': 'Photo metadata updated successfully',
            'photoData': dict(updated_photo_data)
        }))
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
        return response
            
    except Exception as e:
        print(f"CRITICAL ERROR in update_photo_metadata: {str(e)}")
        return jsonify({'error': f'Server error: {str(e)}'}), 500

@app.route('/api/delete_photo', methods=['POST'])
def delete_photo():
    """Deletes a single photo from filesystem and database."""
    data = request.get_json()
    if not data or 'id' not in data: # Changed to use photo ID
        return jsonify({'error': 'Photo ID is required'}), 400

    photo_id = data['id']
    
    db = get_db()
    cursor = db.cursor()

    # Get filename from DB before deleting record
    cursor.execute('SELECT fileName FROM photos WHERE id = ?', (photo_id,))
    result = cursor.fetchone()
    
    if not result:
        return jsonify({'error': 'Photo not found in database'}), 404
    
    filename = result['fileName']
    filepath = os.path.join(UPLOAD_FOLDER, filename)

    # Remove file from filesystem
    if os.path.exists(filepath):
        try:
            os.remove(filepath)
            print(f"INFO: Physically deleted file: {filepath}")
        except Exception as e:
            print(f"ERROR: Failed to delete file {filepath}: {str(e)}")
            return jsonify({'error': f'Failed to delete file: {str(e)}'}), 500
    else:
        print(f"WARNING: Attempted to delete non-existent file: {filepath}")
        
    # Remove from database
    try:
        cursor.execute('DELETE FROM photos WHERE id = ?', (photo_id,))
        db.commit()
        print(f"INFO: Removed metadata for photo ID: {photo_id}")
        
        response = make_response(jsonify({'message': f'Successfully deleted photo with ID {photo_id}'}))
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
        return response
    except sqlite3.Error as e:
        print(f"Database error during delete: {e}")
        return jsonify({'error': 'Failed to delete photo metadata from database'}), 500

@app.route('/photos/<path:filename>')
def serve_photo(filename):
    """Serve photos from the photos directory."""
    # This route will automatically handle the cache-busting query parameter
    # and serve the correct file.
    print(f"INFO: Attempting to serve photo: {filename} from {UPLOAD_FOLDER}") # Debugging print
    safe_filename = secure_filename(filename) 
    return send_from_directory(UPLOAD_FOLDER, safe_filename)

@app.route('/api/metadata', methods=['GET'])
def get_all_metadata():
    """Get all photo metadata as a flat dictionary (for JSON export/viewer)."""
    db = get_db()
    cursor = db.cursor()
    cursor.execute('SELECT * FROM photos')
    photos_list = cursor.fetchall()
    
    # Convert Row objects to dictionaries
    photos_dicts = [dict(row) for row in photos_list]
    
    # Convert list of dicts to a dict keyed by photo ID for compatibility with old structure
    metadata_dict = {photo['id']: photo for photo in photos_dicts}
    
    response = make_response(jsonify(metadata_dict))
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

@app.route('/api/photos/by-date/<date>', methods=['GET'])
def get_photos_by_date(date):
    """Get photos for a specific date."""
    db = get_db()
    cursor = db.cursor()
    cursor.execute('SELECT * FROM photos WHERE substr(photoDateTime, 1, 10) = ? ORDER BY photoDateTime DESC', (date,))
    photos_list = cursor.fetchall()
    
    photos_dicts = [dict(row) for row in photos_list]
    
    response = make_response(jsonify({'photos': photos_dicts, 'date': date}))
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

@app.route('/api/stats', methods=['GET'])
def get_stats():
    """Get photo statistics."""
    db = get_db()
    cursor = db.cursor()
    cursor.execute('SELECT photoDateTime FROM photos')
    all_dates = cursor.fetchall()
    
    total_photos = len(all_dates)
    
    # Extract just the date part (YYYY-MM-DD)
    date_only_list = [row['photoDateTime'][:10] for row in all_dates]
    
    total_unique_dates = len(set(date_only_list))
    
    photos_per_date = {}
    for date_key in date_only_list:
        photos_per_date[date_key] = photos_per_date.get(date_key, 0) + 1
    
    oldest_photo = None
    newest_photo = None
    if all_dates:
        # Assuming photoDateTime is sortable string (ISO format)
        oldest_photo = min(all_dates)[0]
        newest_photo = max(all_dates)[0]
    
    stats = {
        'totalPhotos': total_photos,
        'totalDates': total_unique_dates,
        'photosPerDate': photos_per_date,
        'oldestPhoto': oldest_photo,
        'newestPhoto': newest_photo
    }
    
    response = make_response(jsonify(stats))
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

# Error handler for 404
@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Endpoint not found'}), 404

# Error handler for 500
@app.errorhandler(500)
def internal_error(error):
    print(f"Internal server error: {error}")
    return jsonify({'error': 'Internal server error'}), 500

if __name__ == '__main__':
    # Ensure database is initialized before running the app
    if not os.path.exists(DATABASE):
        init_db()
    print(f"Serving uploaded photos from: {UPLOAD_FOLDER}") # Debugging print
    app.run(debug=True)
