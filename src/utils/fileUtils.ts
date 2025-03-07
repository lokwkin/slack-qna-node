import { fileTypeFromBuffer } from 'file-type';

/**
 * Determines the file extension and MIME type from a buffer
 * Uses the file-type library for robust detection
 * 
 * @param buffer The file buffer to analyze
 * @returns Promise resolving to an object with ext and mime properties, or undefined if type couldn't be determined
 */
export async function getFileTypeFromBuffer(buffer: Buffer) {
    try {
        return await fileTypeFromBuffer(buffer);
    } catch (error) {
        console.error('Error detecting file type:', error);
        return undefined;
    }
}

/**
 * Determines the appropriate filename for a file buffer
 * 
 * @param buffer The file buffer
 * @param defaultName The default filename without extension (default: 'file')
 * @param defaultExt The default extension if type detection fails (default: 'bin')
 * @returns Promise resolving to a filename with the correct extension
 */
export async function getFilename(buffer: Buffer, defaultName = 'file', defaultExt = 'bin'): Promise<string> {
    const fileType = await getFileTypeFromBuffer(buffer);
    const extension = fileType?.ext || defaultExt;
    return `${defaultName}.${extension}`;
}

/**
 * Checks if a buffer contains an image
 * 
 * @param buffer The file buffer to check
 * @returns Promise resolving to boolean indicating if the buffer contains an image
 */
export async function isImage(buffer: Buffer): Promise<boolean> {
    const fileType = await getFileTypeFromBuffer(buffer);
    return fileType?.mime?.startsWith('image/') || false;
} 