import React from 'react';
import { Upload, Camera, Images, X } from 'lucide-react';

export default function MediaCard({ mediaProps }) {
  const {
    fileInputRef,
    handleMediaUpload,
    uploadingMedia,
    setShowCamera,
    galleryInputRef,
    mediaFiles,
    getFilePreview,
    getFileIcon,
    removeMediaFile
  } = mediaProps;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-6 shadow-sm">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="p-1.5 rounded-lg bg-purple-50 dark:bg-purple-900/30"><Upload className="w-4 h-4 text-purple-500 dark:text-purple-400" /></div>
        <h2 className="font-bold text-gray-900 dark:text-gray-100 text-lg">Attachments</h2>
        <span className="text-xs text-gray-500 dark:text-gray-400 font-normal">(optional)</span>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,audio/*,video/*,.pdf,.doc,.docx"
        onChange={handleMediaUpload}
        className="hidden"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadingMedia}
          className="flex-1 py-5 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl hover:border-purple-300 dark:hover:border-purple-600 hover:bg-purple-50/30 dark:hover:bg-purple-900/10 transition-all flex flex-col items-center gap-2 text-gray-400 dark:text-gray-500 hover:text-purple-500 dark:hover:text-purple-400"
        >
          <Upload className="w-4 h-4" />
          <span className="text-xs font-medium">
            {uploadingMedia ? 'Uploading...' : 'Click to upload'}
          </span>
          <span className="text-xs">Photos, documents, audio</span>
        </button>
        <button
          type="button"
          onClick={() => setShowCamera(true)}
          disabled={uploadingMedia}
          className="w-20 py-5 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl hover:border-purple-300 dark:hover:border-purple-600 hover:bg-purple-50/30 dark:hover:bg-purple-900/10 transition-all flex flex-col items-center gap-2 text-gray-400 dark:text-gray-500 hover:text-purple-500 dark:hover:text-purple-400 shrink-0"
        >
          <Camera className="w-4 h-4" />
          <span className="text-xs font-medium">Camera</span>
        </button>
        <button
          type="button"
          onClick={() => galleryInputRef.current?.click()}
          disabled={uploadingMedia}
          className="w-20 py-5 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl hover:border-purple-300 dark:hover:border-purple-600 hover:bg-purple-50/30 dark:hover:bg-purple-900/10 transition-all flex flex-col items-center gap-2 text-gray-400 dark:text-gray-500 hover:text-purple-500 dark:hover:text-purple-400 shrink-0"
        >
          <Images className="w-4 h-4" />
          <span className="text-xs font-medium">Gallery</span>
        </button>
      </div>
      <input
        ref={galleryInputRef}
        type="file"
        multiple
        accept="image/*"
        onChange={handleMediaUpload}
        className="hidden"
      />
      {mediaFiles.length > 0 && (
        <div className="mt-2.5 space-y-1.5">
          {mediaFiles.map((file, idx) => (
            <div key={idx} className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 text-sm">
              {getFilePreview(file) ? (
                <img src={getFilePreview(file)} alt="" className="w-8 h-8 rounded-lg object-cover" />
              ) : (
                <span className="text-base">{getFileIcon(file)}</span>
              )}
              <span className="flex-1 truncate text-gray-700 dark:text-gray-300">{file.name}</span>
              <button type="button" onClick={() => removeMediaFile(idx)}
                className="p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
