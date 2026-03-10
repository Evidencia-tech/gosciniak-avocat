/// Describes how a file was captured or obtained.
/// Stored in the proof receipt as `captureMethod`.
enum CaptureMethod {
  /// File was captured directly from the device camera (photo or video).
  camera('sdk_flutter_camera'),

  /// File was selected from the device photo library.
  photoLibrary('sdk_flutter_library'),

  /// File was uploaded from the filesystem (documents, etc.).
  fileUpload('sdk_flutter_upload'),

  /// Hash was pre-computed by the caller (privacy mode — file never sent).
  precomputedHash('sdk_flutter_hash'),

  /// Custom capture method specified by the caller.
  custom('sdk_flutter_custom');

  const CaptureMethod(this.value);
  final String value;
}
