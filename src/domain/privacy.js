// Error messages from a crashed process often contain the full path of a file on this computer,
// which includes the user name. Recorded details are shown on screen and saved to disk, so keep
// only the file name and drop the folders.

const FILE_URL = /file:\/\/\/?(?:[A-Za-z]:)?(?:[/\\][^\s'")\]:\\/]+)*[/\\]([^\s'")\]:\\/]+)/g;
const WINDOWS_PATH = /[A-Za-z]:\\(?:[^\s'")\]:\\]+\\)*([^\s'")\]:\\]+)/g;
const POSIX_PATH = /(?<![\w.])\/(?:[^\s'")\]:/]+\/)+([^\s'")\]:/]+)/g;

export function scrubPaths(text) {
  if (typeof text !== 'string') return text;
  return text.replace(FILE_URL, '$1').replace(WINDOWS_PATH, '$1').replace(POSIX_PATH, '$1');
}
