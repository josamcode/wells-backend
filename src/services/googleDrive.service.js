const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

class GoogleDriveService {
  constructor() {
    this.auth = null;
    this.drive = null;
  }

  // Initialize with service account or OAuth credentials
  async initialize(credentials) {
    try {
      if (credentials.type === 'service_account') {
        // Service Account authentication
        this.auth = new google.auth.GoogleAuth({
          credentials: {
            client_email: credentials.client_email,
            private_key: credentials.private_key.replace(/\\n/g, '\n'),
          },
          scopes: ['https://www.googleapis.com/auth/drive.file'],
        });
      } else if (credentials.refresh_token) {
        // OAuth2 authentication
        const oauth2Client = new google.auth.OAuth2(
          credentials.client_id,
          credentials.client_secret,
          credentials.redirect_uri
        );
        oauth2Client.setCredentials({
          refresh_token: credentials.refresh_token,
        });
        this.auth = oauth2Client;
      }

      this.drive = google.drive({ version: 'v3', auth: this.auth });
      return true;
    } catch (error) {
      console.error('Google Drive initialization error:', error);
      return false;
    }
  }

  // Create a folder
  async createFolder(folderName, parentFolderId = null) {
    try {
      const fileMetadata = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
      };

      if (parentFolderId) {
        fileMetadata.parents = [parentFolderId];
      }

      const response = await this.drive.files.create({
        requestBody: fileMetadata,
        fields: 'id, name, webViewLink',
      });

      return {
        id: response.data.id,
        name: response.data.name,
        url: response.data.webViewLink,
      };
    } catch (error) {
      console.error('Create folder error:', error);
      throw error;
    }
  }

  // Upload a file
  async uploadFile(filePath, fileName, folderId = null, mimeType = 'application/octet-stream') {
    try {
      const fileMetadata = {
        name: fileName,
      };

      if (folderId) {
        fileMetadata.parents = [folderId];
      }

      const media = {
        mimeType: mimeType,
        body: fs.createReadStream(filePath),
      };

      const response = await this.drive.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: 'id, name, webViewLink, webContentLink, mimeType, size',
      });

      // Make file accessible (optional - adjust permissions as needed)
      await this.drive.permissions.create({
        fileId: response.data.id,
        requestBody: {
          role: 'reader',
          type: 'anyone',
        },
      });

      return {
        id: response.data.id,
        name: response.data.name,
        url: response.data.webViewLink,
        downloadUrl: response.data.webContentLink,
        mimeType: response.data.mimeType,
        size: response.data.size,
      };
    } catch (error) {
      console.error('Upload file error:', error);
      throw error;
    }
  }

  // Delete a file
  async deleteFile(fileId) {
    try {
      await this.drive.files.delete({
        fileId: fileId,
      });
      return true;
    } catch (error) {
      console.error('Delete file error:', error);
      throw error;
    }
  }

  // Get file metadata
  async getFileMetadata(fileId) {
    try {
      const response = await this.drive.files.get({
        fileId: fileId,
        fields: 'id, name, mimeType, size, createdTime, modifiedTime, webViewLink',
      });
      return response.data;
    } catch (error) {
      console.error('Get file metadata error:', error);
      throw error;
    }
  }

  // List files in a folder
  async listFilesInFolder(folderId) {
    try {
      const response = await this.drive.files.list({
        q: `'${folderId}' in parents and trashed=false`,
        fields: 'files(id, name, mimeType, size, createdTime, webViewLink)',
        orderBy: 'createdTime desc',
      });
      return response.data.files;
    } catch (error) {
      console.error('List files error:', error);
      throw error;
    }
  }

  // Create folder structure for project
  async createProjectFolderStructure(projectNumber, projectName) {
    try {
      // Create main project folder
      const projectFolder = await this.createFolder(`${projectNumber} - ${projectName}`);

      // Create subfolders
      const reportsFolder = await this.createFolder('Reports', projectFolder.id);
      const photosFolder = await this.createFolder('Photos', projectFolder.id);
      const documentsFolder = await this.createFolder('Documents', projectFolder.id);
      const videosFolder = await this.createFolder('Videos', projectFolder.id);

      return {
        projectFolder,
        subfolders: {
          reports: reportsFolder,
          photos: photosFolder,
          documents: documentsFolder,
          videos: videosFolder,
        },
      };
    } catch (error) {
      console.error('Create project folder structure error:', error);
      throw error;
    }
  }
}

// Export singleton instance
module.exports = new GoogleDriveService();

