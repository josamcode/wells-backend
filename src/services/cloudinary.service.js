const cloudinary = require('cloudinary').v2;
const { Readable } = require('stream');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

class CloudinaryService {
  /**
   * Upload a file buffer to Cloudinary
   * @param {Buffer} fileBuffer - File buffer
   * @param {String} fileName - Original file name
   * @param {String} folder - Cloudinary folder path
   * @param {Object} options - Additional upload options
   * @returns {Promise<Object>} Upload result
   */
  async uploadFile(fileBuffer, fileName, folder = 'users', options = {}) {
    return new Promise((resolve, reject) => {
      // Determine resource_type - use provided option or default to 'auto'
      // IMPORTANT: Don't let 'auto' override explicit resource_type from options
      const resourceType = options.resource_type || 'auto';

      const uploadOptions = {
        folder: folder,
        resource_type: resourceType,
        access_mode: 'public', // Ensure files are publicly accessible
        // For PDFs, explicitly set type to 'upload' to ensure proper storage
        type: 'upload',
        ...options,
      };

      // Override access_mode if provided in options (options take precedence)
      if (options.access_mode) {
        uploadOptions.access_mode = options.access_mode;
      }

      console.log(`Uploading file to Cloudinary with options:`, {
        folder: uploadOptions.folder,
        resource_type: uploadOptions.resource_type,
        access_mode: uploadOptions.access_mode,
      });

      const uploadStream = cloudinary.uploader.upload_stream(
        uploadOptions,
        (error, result) => {
          if (error) {
            console.error('Cloudinary upload error:', error);
            return reject(error);
          }
          console.log(`File uploaded successfully: ${result.public_id} as ${result.resource_type}`);
          resolve(result);
        }
      );

      // Convert buffer to stream
      const bufferStream = new Readable();
      bufferStream.push(fileBuffer);
      bufferStream.push(null);
      bufferStream.pipe(uploadStream);
    });
  }

  /**
   * Delete a file from Cloudinary
   * @param {String} publicId - Cloudinary public ID
   * @param {String} resourceType - Resource type (image, raw, video)
   * @returns {Promise<Object>} Deletion result
   */
  async deleteFile(publicId, resourceType = 'image') {
    try {
      // Try with provided resource type first
      let result = await cloudinary.uploader.destroy(publicId, {
        resource_type: resourceType,
      });

      // If not found, try other types
      if (result.result === 'not found') {
        const types = ['raw', 'image', 'video'].filter(t => t !== resourceType);
        for (const type of types) {
          result = await cloudinary.uploader.destroy(publicId, {
            resource_type: type,
          });
          if (result.result === 'ok') break;
        }
      }

      return result;
    } catch (error) {
      console.error('Cloudinary delete error:', error);
      throw error;
    }
  }

  /**
   * Upload multiple files
   * @param {Array} files - Array of file objects with buffer and filename
   * @param {String} folder - Cloudinary folder path
   * @returns {Promise<Array>} Array of upload results
   */
  async uploadMultipleFiles(files, folder = 'users') {
    const uploadPromises = files.map((file) =>
      this.uploadFile(file.buffer, file.originalname, folder)
    );
    return Promise.all(uploadPromises);
  }

  /**
   * Get a signed URL for a Cloudinary resource
   * @param {String} publicId - Cloudinary public ID
   * @param {Object} options - Additional options
   * @returns {String} Signed URL
   */
  getSignedUrl(publicId, options = {}) {
    return cloudinary.url(publicId, {
      secure: true,
      sign_url: true,
      ...options,
    });
  }

  /**
   * Stream a file from Cloudinary
   * @param {String} publicId - Cloudinary public ID
   * @param {Object} options - Additional options
   * @returns {Promise<Stream>} File stream
   */
  async streamFile(publicId, options = {}) {
    const url = this.getSignedUrl(publicId, options);
    const https = require('https');
    const http = require('http');
    const urlModule = require('url');
    const fileUrl = new urlModule.URL(url);
    const protocol = fileUrl.protocol === 'https:' ? https : http;

    return new Promise((resolve, reject) => {
      protocol.get(url, (res) => {
        if (res.statusCode !== 200) {
          return reject(new Error(`Failed to fetch file: ${res.statusCode}`));
        }
        resolve(res);
      }).on('error', reject);
    });
  }

  /**
   * Find resource and determine its type
   * @param {String} publicId - Cloudinary public ID
   * @param {String} preferredType - Preferred resource type to try first
   * @returns {Promise<{resource: Object, resourceType: String}>}
   */
  async findResource(publicId, preferredType = 'raw') {
    const typesToTry = preferredType === 'raw'
      ? ['raw', 'image', 'video']
      : ['image', 'raw', 'video'];

    for (const type of typesToTry) {
      try {
        const resource = await cloudinary.api.resource(publicId, {
          resource_type: type,
        });
        console.log(`Found resource as ${type}:`, {
          public_id: resource.public_id,
          format: resource.format,
          access_mode: resource.access_mode,
          type: resource.type,
        });
        return { resource, resourceType: type };
      } catch (error) {
        // Continue to next type
      }
    }

    throw new Error(`Resource not found: ${publicId}`);
  }

  /**
   * Make a resource publicly accessible
   * @param {String} publicId - Cloudinary public ID
   * @param {String} resourceType - Resource type
   * @returns {Promise<Object>} Updated resource
   */
  async makePublic(publicId, resourceType) {
    try {
      console.log(`Attempting to make ${publicId} public (type: ${resourceType})`);

      await cloudinary.uploader.explicit(publicId, {
        resource_type: resourceType,
        type: 'upload',
        access_mode: 'public',
      });

      // Re-fetch to get updated URL
      const resource = await cloudinary.api.resource(publicId, {
        resource_type: resourceType,
      });

      console.log(`Made public successfully, new access_mode: ${resource.access_mode}`);
      return resource;
    } catch (error) {
      console.warn('Could not make file public:', error.message);
      throw error;
    }
  }

  /**
   * Download a file from Cloudinary
   * @param {String} publicId - Cloudinary public ID
   * @param {Object} options - Additional options
   * @returns {Promise<Buffer>} File buffer
   */
  async downloadFile(publicId, options = {}) {
    try {
      const preferredType = options.resource_type === 'auto' ? 'raw' : (options.resource_type || 'raw');

      console.log(`Attempting to download file: ${publicId}`);

      // Step 1: Find the resource
      const { resource, resourceType } = await this.findResource(publicId, preferredType);

      // Check if this is a PDF stored as image type - if so, try raw type
      let actualResourceType = resourceType;
      if (resource.format === 'pdf' && resourceType === 'image') {
        console.log('PDF found as image type, trying to find as raw type...');
        try {
          const rawResource = await cloudinary.api.resource(publicId, {
            resource_type: 'raw',
          });
          if (rawResource) {
            console.log('Found PDF as raw type, using that instead');
            actualResourceType = 'raw';
            // Update resource to use raw version
            resource.secure_url = rawResource.secure_url;
            resource.access_mode = rawResource.access_mode;
          }
        } catch (rawError) {
          console.log('Could not find as raw type, continuing with image type');
        }
      }

      // Step 2: Try to download with secure_url directly first
      if (actualResource.secure_url) {
        console.log('Trying secure_url directly...');
        try {
          const buffer = await this.fetchUrl(actualResource.secure_url);
          console.log('Download via secure_url succeeded');
          return buffer;
        } catch (error) {
          console.log(`secure_url failed: ${error.message}`);
        }
      }

      // Step 2b: For PDFs stored as image, try using the image URL with format parameter
      if (resource.format === 'pdf' && resourceType === 'image') {
        console.log('PDF stored as image type, trying format transformation URLs...');

        // Try multiple URL formats for PDFs stored as images
        const pdfUrlFormats = [
          // Format 1: Direct format parameter (no transformation)
          cloudinary.url(publicId, {
            resource_type: 'image',
            secure: true,
            format: 'pdf',
            type: 'upload',
          }),
          // Format 2: With signed URL
          cloudinary.url(publicId, {
            resource_type: 'image',
            secure: true,
            sign_url: true,
            format: 'pdf',
            type: 'upload',
          }),
          // Format 3: Try accessing via raw transformation
          cloudinary.url(publicId, {
            resource_type: 'image',
            secure: true,
            sign_url: true,
            transformation: [{ format: 'pdf' }],
            type: 'upload',
          }),
        ];

        for (const pdfUrl of pdfUrlFormats) {
          try {
            console.log(`Trying PDF format URL: ${pdfUrl.substring(0, 100)}...`);
            const buffer = await this.fetchUrl(pdfUrl);
            console.log('Download via PDF format URL succeeded');
            return buffer;
          } catch (error) {
            console.log(`PDF format URL failed: ${error.message}`);
          }
        }
      }

      // Step 3: If file is not public, try to make it public
      if (actualResource.access_mode !== 'public') {
        try {
          const publicResource = await this.makePublic(publicId, actualResourceType);
          if (publicResource.secure_url) {
            console.log('Trying secure_url after making public...');
            try {
              const buffer = await this.fetchUrl(publicResource.secure_url);
              console.log('Download via public secure_url succeeded');
              return buffer;
            } catch (error) {
              console.log(`Public secure_url failed: ${error.message}`);
            }
          }
        } catch (error) {
          console.log('Could not make public, trying other methods...');
        }
      }

      // Step 4: For PDFs (raw type), try private_download_url first
      if (actualResourceType === 'raw' || resource.format === 'pdf') {
        console.log('Trying private_download_url for PDF...');
        try {
          const privateUrl = cloudinary.utils.private_download_url(publicId, 'pdf', {
            resource_type: 'raw',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
          });
          const buffer = await this.fetchUrl(privateUrl);
          console.log('Download via private_download_url succeeded');
          return buffer;
        } catch (error) {
          console.log(`private_download_url failed: ${error.message}`);
        }
      }

      // Step 5: Try signed URL with correct resource type
      console.log(`Trying signed URL with resource_type: ${actualResourceType}...`);
      try {
        const signedUrl = cloudinary.url(publicId, {
          resource_type: actualResourceType,
          secure: true,
          sign_url: true,
          type: 'upload',
        });
        const buffer = await this.fetchUrl(signedUrl);
        console.log('Download via signed URL succeeded');
        return buffer;
      } catch (error) {
        console.log(`Signed URL failed: ${error.message}`);
      }

      // Step 6: Try with attachment flag
      console.log('Trying with attachment flag...');
      try {
        const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
        const attachmentUrl = `https://res.cloudinary.com/${cloudName}/${resourceType}/upload/fl_attachment/${publicId}`;
        const buffer = await this.fetchUrl(attachmentUrl);
        console.log('Download via attachment URL succeeded');
        return buffer;
      } catch (error) {
        console.log(`Attachment URL failed: ${error.message}`);
      }

      // Step 7: For PDFs stored as image, try using the original secure_url with .pdf extension
      // Sometimes the URL works if we change the extension
      if (resource.format === 'pdf' && resourceType === 'image' && resource.secure_url) {
        console.log('PDF stored as image, trying secure_url variations...');
        const secureUrlVariations = [
          // Try with .pdf extension
          resource.secure_url.replace(/\.(jpg|jpeg|png|gif|webp)$/i, '.pdf'),
          // Try removing extension and adding .pdf
          resource.secure_url.replace(/\.[^.]+$/, '.pdf'),
          // Try the original URL as-is (might work for some configurations)
          resource.secure_url,
        ];

        for (const pdfUrl of secureUrlVariations) {
          try {
            console.log(`Trying secure_url variation: ${pdfUrl.substring(0, 100)}...`);
            const buffer = await this.fetchUrl(pdfUrl);
            console.log('Download via secure_url variation succeeded');
            return buffer;
          } catch (error) {
            console.log(`secure_url variation failed: ${error.message}`);
          }
        }
      }

      // Step 8: Try downloading file bytes directly via Admin API
      console.log('Trying direct Admin API download...');
      try {
        const buffer = await this.downloadFileBytes(publicId, actualResourceType);
        console.log('Download via Admin API bytes succeeded');
        return buffer;
      } catch (error) {
        console.log(`Admin API bytes download failed: ${error.message}`);
      }

      // Step 8: Try authenticated download URL
      console.log('Trying authenticated download...');
      try {
        const buffer = await this.authenticatedDownload(publicId, actualResourceType);
        console.log('Download via authenticated URL succeeded');
        return buffer;
      } catch (error) {
        console.log(`Authenticated download failed: ${error.message}`);
      }

      throw new Error(`All download methods failed for ${publicId}`);
    } catch (error) {
      console.error('Error downloading file from Cloudinary:', error);
      throw error;
    }
  }

  /**
   * Download file bytes directly using Cloudinary Admin API
   * Uses the download URL from the resource response
   * @param {String} publicId - Cloudinary public ID
   * @param {String} resourceType - Resource type
   * @returns {Promise<Buffer>} File buffer
   */
  async downloadFileBytes(publicId, resourceType) {
    // Get resource info first
    const resource = await cloudinary.api.resource(publicId, {
      resource_type: resourceType,
    });

    // For PDFs stored as image type, Cloudinary has restrictions
    // PDFs stored as 'image' type cannot be accessed via URLs (Cloudinary security feature)
    // We need to download the file using Admin API and re-upload as raw type, or use a workaround
    if (resource.format === 'pdf' && resourceType === 'image') {
      console.warn('PDF stored as image type - attempting workaround...');

      // Try to get it as raw type first (might exist as both)
      try {
        const rawResource = await cloudinary.api.resource(publicId, {
          resource_type: 'raw',
        });
        if (rawResource && rawResource.secure_url) {
          console.log('Found as raw type, using raw secure_url');
          try {
            return await this.fetchUrl(rawResource.secure_url);
          } catch (error) {
            console.log('Raw secure_url failed');
          }
        }
      } catch (rawError) {
        console.log('Not found as raw type');
      }

      // Workaround: Use the original secure_url from the resource
      // Sometimes the URL works even if it's stored as image type
      if (resource.secure_url) {
        try {
          console.log('Trying original secure_url as last resort...');
          return await this.fetchUrl(resource.secure_url);
        } catch (error) {
          console.log('Original secure_url failed');
        }
      }

      // If all else fails, throw a clear error
      throw new Error('PDF stored as image type cannot be accessed. The file needs to be re-uploaded with resource_type: "raw".');
    }

    // For raw files, use standard signed URL
    if (resourceType === 'raw') {
      const downloadUrl = cloudinary.url(publicId, {
        resource_type: 'raw',
        secure: true,
        sign_url: true,
        type: 'upload',
      });
      return this.fetchUrl(downloadUrl);
    }

    // For other files, use secure_url
    if (resource.secure_url) {
      return this.fetchUrl(resource.secure_url);
    }

    throw new Error('No download URL available');
  }

  /**
   * Perform an authenticated download using Cloudinary credentials
   * For PDFs stored as image type, this uses the Admin API to get a downloadable URL
   * @param {String} publicId - Cloudinary public ID
   * @param {String} resourceType - Resource type
   * @returns {Promise<Buffer>} File buffer
   */
  async authenticatedDownload(publicId, resourceType) {
    // Get resource info first
    const resource = await cloudinary.api.resource(publicId, {
      resource_type: resourceType,
    });

    // For PDFs stored as image, we need to use a special download URL
    if (resource.format === 'pdf' && resourceType === 'image') {
      const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
      const version = resource.version;

      // Try multiple URL formats for PDFs stored as images
      const downloadUrls = [
        // Format 1: With version in path
        version ? `https://res.cloudinary.com/${cloudName}/image/upload/v${version}/${publicId}.pdf` : null,
        // Format 2: Without version
        `https://res.cloudinary.com/${cloudName}/image/upload/${publicId}.pdf`,
        // Format 3: Using Cloudinary URL helper
        cloudinary.url(publicId, {
          resource_type: 'image',
          secure: true,
          format: 'pdf',
          version: version,
          type: 'upload',
        }),
      ].filter(Boolean);

      for (const downloadUrl of downloadUrls) {
        try {
          console.log(`Trying authenticated PDF URL: ${downloadUrl.substring(0, 100)}...`);
          return await this.fetchUrl(downloadUrl);
        } catch (error) {
          console.log(`Authenticated PDF URL failed: ${error.message}`);
        }
      }

      throw new Error('All authenticated PDF URLs failed');
    }

    // For other files, use secure_url
    if (resource.secure_url) {
      return this.fetchUrl(resource.secure_url);
    }

    throw new Error('No download URL available');
  }

  /**
   * Fetch a URL and return the buffer
   * @param {String} url - URL to fetch
   * @param {Number} maxRedirects - Maximum number of redirects to follow
   * @returns {Promise<Buffer>} File buffer
   */
  fetchUrl(url, maxRedirects = 5) {
    const https = require('https');
    const http = require('http');

    return new Promise((resolve, reject) => {
      if (maxRedirects <= 0) {
        return reject(new Error('Too many redirects'));
      }

      const protocol = url.startsWith('https') ? https : http;

      const request = protocol.get(url, (res) => {
        // Handle redirects
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
          const redirectUrl = res.headers.location;
          if (redirectUrl) {
            console.log(`Following redirect to: ${redirectUrl.substring(0, 100)}...`);
            return this.fetchUrl(redirectUrl, maxRedirects - 1).then(resolve).catch(reject);
          }
          return reject(new Error(`Redirect without location header`));
        }

        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }

        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          console.log(`Downloaded ${buffer.length} bytes`);
          resolve(buffer);
        });
        res.on('error', reject);
      });

      request.on('error', reject);
      request.setTimeout(30000, () => {
        request.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }
}

module.exports = new CloudinaryService();