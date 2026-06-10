import React, { useState } from 'react';
import { Upload, Camera, Images, X, ChevronRight, ChevronDown } from 'lucide-react';

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

  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button type="button" onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        Attachments
        {mediaFiles.length > 0 && (
          <span className="text-[10px] text-gray-400 dark:text-gray-500 font-normal">({mediaFiles.length})</span>
        )}
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          <input ref={fileInputRef} type="file" multiple accept="image/*,audio/*,video/*,.pdf,.doc,.docx"
            onChange={handleMediaUpload} className="hidden" />
          <input ref={galleryInputRef} type="file" multiple accept="image/*"
            onChange={handleMediaUpload} className="hidden" />

          <div className="flex gap-1.5">
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadingMedia}
              className="flex-1 py-2.5 border border-dashed border-gray-200 dark:border-gray-700 rounded-lg hover:border-purple-300 dark:hover:border-purple-600 hover:bg-purple-50/30 dark:hover:bg-purple-900/10 transition-all flex items-center justify-center gap-1.5 text-gray-400 hover:text-purple-500">
              <Upload className="w-3 h-3" />
              <span className="text-[10px] font-medium">{uploadingMedia ? 'Uploading...' : 'Upload'}</span>
            </button>
            <button type="button" onClick={() => setShowCamera(true)} disabled={uploadingMedia}
              className="w-12 py-2.5 border border-dashed border-gray-200 dark:border-gray-700 rounded-lg hover:border-purple-300 dark:hover:border-purple-600 hover:bg-purple-50/30 dark:hover:bg-purple-900/10 transition-all flex items-center justify-center text-gray-400 hover:text-purple-500">
              <Camera className="w-3 h-3" />
            </button>
            <button type="button" onClick={() => galleryInputRef.current?.click()} disabled={uploadingMedia}
              className="w-12 py-2.5 border border-dashed border-gray-200 dark:border-gray-700 rounded-lg hover:border-purple-300 dark:hover:border-purple-600 hover:bg-purple-50/30 dark:hover:bg-purple-900/10 transition-all flex items-center justify-center text-gray-400 hover:text-purple-500">
              <Images className="w-3 h-3" />
            </button>
          </div>

          {mediaFiles.length > 0 && (
            <div className="space-y-1">
              {mediaFiles.map((file, idx) => (
                <div key={idx} className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-700">
                  {getFilePreview(file) ? (
                    <img src={getFilePreview(file)} alt="" className="w-6 h-6 rounded object-cover" />
                  ) : (
                    <span className="text-xs">{getFileIcon(file)}</span>
                  )}
                  <span className="flex-1 truncate text-[10px] text-gray-600 dark:text-gray-400">{file.name}</span>
                  <button type="button" onClick={() => removeMediaFile(idx)}
                    className="p-0.5 text-gray-300 dark:text-gray-600 hover:text-red-500 transition-colors">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
