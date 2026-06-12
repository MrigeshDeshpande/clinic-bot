'use client';

/* eslint-disable @next/next/no-img-element */
import React, { useEffect, useMemo, useState } from 'react';
import { Camera, ChevronDown, ChevronRight, Download, File, FileAudio, FileImage, Images, Paperclip, Upload, X } from 'lucide-react';

function getMediaType(key) {
  if (!key) return 'file';
  if (key.includes('_photo.')) return 'photo';
  if (key.includes('_audio.')) return 'audio';
  return 'file';
}

function getMediaLabel(key) {
  const parts = key?.split('/') || [];
  const filename = parts[parts.length - 1] || key || '';
  if (getMediaType(key) === 'photo') return filename.replace(/^\d+_photo\./, 'Photo ');
  if (getMediaType(key) === 'audio') return filename.replace(/^\d+_audio\./, 'Audio ');
  return filename;
}

function SavedFileIcon({ type }) {
  if (type === 'photo') return <FileImage className="w-4 h-4" />;
  if (type === 'audio') return <FileAudio className="w-4 h-4" />;
  return <File className="w-4 h-4" />;
}

function LocalFileIcon({ file }) {
  if (file.type?.startsWith('image/')) return <FileImage className="w-4 h-4" />;
  if (file.type?.startsWith('audio/')) return <FileAudio className="w-4 h-4" />;
  return <File className="w-4 h-4" />;
}

function formatDate(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

export default function AttachmentsPanel({ mediaProps, currentMedia = [], visitMediaGroups = [], getSignedUrl }) {
  const {
    fileInputRef,
    handleMediaUpload,
    uploadingMedia,
    setShowCamera,
    galleryInputRef,
    mediaFiles,
    getFilePreview,
    removeMediaFile,
  } = mediaProps;
  const [expanded, setExpanded] = useState(true);
  const [openImage, setOpenImage] = useState(null);

  useEffect(() => {
    if (!openImage) return;
    function onKeyDown(event) {
      if (event.key === 'Escape') setOpenImage(null);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [openImage]);

  const savedGroups = useMemo(() => {
    const groups = [];
    if (currentMedia.length > 0) {
      groups.push({ id: 'current', title: 'This Visit', date: null, media: currentMedia });
    }
    for (const group of visitMediaGroups) {
      if (!group?.media?.length) continue;
      groups.push({
        id: group.id,
        title: group.title || 'Previous Visit',
        date: group.date,
        media: group.media,
      });
    }
    return groups;
  }, [currentMedia, visitMediaGroups]);

  const savedCount = savedGroups.reduce((sum, group) => sum + group.media.length, 0);
  const localCount = mediaFiles.length;
  const totalCount = savedCount + localCount;

  return (
    <>
      <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
        <button type="button" onClick={() => setExpanded(e => !e)}
          className="w-full flex items-center gap-2 px-4 py-3 text-left border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
          {expanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
          <Paperclip className="w-4 h-4 text-blue-500 shrink-0" />
          <span className="flex-1 text-sm font-bold leading-5 text-gray-900 dark:text-gray-100">Attachments</span>
          {totalCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-bold">
              {totalCount}
            </span>
          )}
        </button>

        {expanded && (
          <div className="p-4 space-y-4">
          <input ref={fileInputRef} type="file" multiple accept="image/*,audio/*,video/*,.pdf,.doc,.docx"
            onChange={handleMediaUpload} className="hidden" />
          <input ref={galleryInputRef} type="file" multiple accept="image/*"
            onChange={handleMediaUpload} className="hidden" />

          <div className="grid grid-cols-[1fr_2.5rem_2.5rem] gap-1.5">
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadingMedia}
              className="py-2 border border-dashed border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-50/40 dark:hover:bg-blue-900/10 transition-all flex items-center justify-center gap-1.5 text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-60">
              <Upload className="w-4 h-4" />
              <span className="text-sm font-semibold leading-5">{uploadingMedia ? 'Uploading...' : 'Upload'}</span>
            </button>
            <button type="button" onClick={() => setShowCamera(true)} disabled={uploadingMedia}
              className="py-2 border border-dashed border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-50/40 dark:hover:bg-blue-900/10 transition-all flex items-center justify-center text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-60"
              title="Camera">
              <Camera className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => galleryInputRef.current?.click()} disabled={uploadingMedia}
              className="py-2 border border-dashed border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-50/40 dark:hover:bg-blue-900/10 transition-all flex items-center justify-center text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-60"
              title="Gallery">
              <Images className="w-4 h-4" />
            </button>
          </div>

          {localCount > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">Pending Upload</span>
                <span className="text-xs text-gray-400 dark:text-gray-500">({localCount})</span>
              </div>
              <div className="space-y-1.5">
                {mediaFiles.map((file, idx) => {
                  const preview = getFilePreview(file);
                  return (
                    <div key={`${file.name}-${idx}`} className="flex items-center gap-2 px-2.5 py-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-700">
                      {preview ? (
                        <button type="button" onClick={() => setOpenImage({ src: preview, label: file.name })}
                          className="w-9 h-9 rounded-md overflow-hidden border border-gray-200 dark:border-gray-700 shrink-0">
                          <img src={preview} alt="" className="w-full h-full object-cover" />
                        </button>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500"><LocalFileIcon file={file} /></span>
                      )}
                      <span className="flex-1 min-w-0 truncate text-sm leading-5 text-gray-700 dark:text-gray-300">{file.name}</span>
                      <button type="button" onClick={() => removeMediaFile(idx)}
                        className="p-1 text-gray-300 dark:text-gray-600 hover:text-red-500 rounded-md transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {savedGroups.length > 0 && (
            <div className="space-y-4">
              {savedGroups.map(group => (
                <div key={group.id}>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">{group.title}</span>
                    {group.date && <span className="text-xs text-gray-400 dark:text-gray-500">{formatDate(group.date)}</span>}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {group.media.map(key => {
                      const type = getMediaType(key);
                      const url = getSignedUrl(key);
                      const label = getMediaLabel(key);
                      if (type === 'photo') {
                        return (
                          <button type="button" key={key} onClick={() => setOpenImage({ src: url, label })}
                            className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 hover:border-blue-300 dark:hover:border-blue-600 transition-all">
                            <img src={url} alt={label} loading="lazy"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
                            <div className="absolute inset-x-0 bottom-0 bg-black/50 px-2 py-1">
                              <p className="text-[11px] leading-4 font-medium text-white truncate">{label}</p>
                            </div>
                          </button>
                        );
                      }
                      return (
                        <a key={key} href={url} target="_blank" rel="noopener noreferrer"
                          className="col-span-2 flex items-center gap-2 px-2.5 py-2 rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-sm text-gray-700 dark:text-gray-300 hover:border-blue-200 dark:hover:border-blue-700 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-all">
                          <span className="text-gray-400 dark:text-gray-500"><SavedFileIcon type={type} /></span>
                          <span className="flex-1 min-w-0 truncate">{label}</span>
                          <Download className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        </a>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {totalCount === 0 && (
            <div className="py-5 text-center rounded-2xl border border-dashed border-gray-200 dark:border-gray-700">
              <Paperclip className="w-5 h-5 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
              <p className="text-sm leading-5 text-gray-400 dark:text-gray-500">No attachments yet</p>
            </div>
          )}
          </div>
        )}
      </div>

      {openImage && (
        <div className="fixed inset-0 z-[100] bg-black/80 p-3 md:p-6 flex items-center justify-center cursor-pointer"
          onClick={() => setOpenImage(null)}>
          <div className="relative max-w-[96vw] max-h-[94vh]" onClick={e => e.stopPropagation()}>
            <div className="absolute left-0 right-12 -top-10 md:-top-11 min-w-0">
              <p className="text-sm font-semibold leading-5 text-white truncate">{openImage.label}</p>
            </div>
            <button type="button" onClick={() => setOpenImage(null)}
              className="absolute -top-12 right-0 md:-top-11 w-9 h-9 rounded-full bg-white/15 text-white border border-white/20 flex items-center justify-center hover:bg-white/25 transition-colors"
              aria-label="Close image preview">
              <X className="w-5 h-5" />
            </button>
            <img src={openImage.src} alt={openImage.label}
              className="block max-w-[96vw] max-h-[90vh] object-contain rounded-xl bg-white shadow-2xl" />
          </div>
        </div>
      )}
    </>
  );
}
