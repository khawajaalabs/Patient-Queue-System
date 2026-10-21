/** Short-lived, server-authorized upload URL; never a public medical-document URL. */
export function uploadPrivateFile(
  url: string,
  file: File,
  progress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.timeout = 60000;
    request.setRequestHeader("Content-Type", file.type);
    request.setRequestHeader("x-upsert", "false");
    request.upload.onprogress = (e) => {
      if (e.lengthComputable) progress(Math.round((e.loaded / e.total) * 100));
    };
    request.onload = () => {
      if ((request.status >= 200 && request.status < 300) || request.status === 409) {
        progress(100);
        resolve();
      } else reject(Error("File upload failed. Please try again."));
    };
    request.onerror = () => reject(Error("File upload failed. Check your connection and retry."));
    request.ontimeout = () => reject(Error("File upload timed out. Please try again."));
    request.send(file);
  });
}
