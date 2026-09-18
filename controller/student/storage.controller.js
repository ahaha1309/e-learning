const FileAsset = require('../../models/FileAsset');
const Classroom = require('../../models/Classroom');
const crypto = require('crypto');

/**
 * Simulates requesting a presigned upload URL
 */
async function requestUploadUrl(req, res, next) {
  try {
    const { originalName, mimeType, sizeBytes, classroomId } = req.body;
    const studentId = req.user.id;

    if (!originalName || !classroomId) {
      return res.status(400).json({ error: 'Thiếu thông tin originalName hoặc classroomId' });
    }

    const classroom = await Classroom.findById(classroomId).lean();
    if (!classroom) {
      return res.status(404).json({ error: 'Lớp học không tồn tại' });
    }

    // Limit file sizes to 100MB for simulation
    const MAX_SIZE = 100 * 1024 * 1024;
    if (sizeBytes > MAX_SIZE) {
      return res.status(400).json({ error: 'Kích thước tệp tin vượt quá giới hạn cho phép (100MB)' });
    }

    // Generate unique mock cloud object key
    const fileExtension = originalName.split('.').pop();
    const hash = crypto.randomBytes(16).toString('hex');
    const key = `submissions/${classroomId}/${studentId}/${hash}.${fileExtension}`;
    const bucket = 'school-lms-secure-bucket';

    // Create pending asset
    const asset = new FileAsset({
      bucket,
      key,
      originalName,
      mimeType,
      sizeBytes,
      owner: studentId,
      classroom: classroomId,
      status: 'pending'
    });
    await asset.save();

    // Mock Presigned URL
    const uploadUrl = `https://school-lms-secure-bucket.s3.amazonaws.com/${key}?signature=mock_sig_${hash}&expires=${Date.now() + 600000}`;

    return res.json({
      success: true,
      uploadUrl,
      fileAssetId: asset._id,
      key
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Confirms mock upload completed and triggers background ClamAV scanning simulation
 */
async function confirmUpload(req, res, next) {
  try {
    const { fileAssetId } = req.body;
    const studentId = req.user.id;

    const asset = await FileAsset.findOne({ _id: fileAssetId, owner: studentId });
    if (!asset) {
      return res.status(404).json({ error: 'Không tìm thấy thông tin tài liệu tải lên' });
    }

    // Transition to scanning state
    asset.status = 'scanning';
    await asset.save();

    // Background malware scan simulation (3 seconds delay)
    setTimeout(async () => {
      try {
        const freshAsset = await FileAsset.findById(fileAssetId);
        if (!freshAsset) return;

        // If filename contains "virus", "eicar", or "infected", fail the scan to demonstrate security
        const lowerName = freshAsset.originalName.toLowerCase();
        if (lowerName.includes('virus') || lowerName.includes('eicar') || lowerName.includes('infected')) {
          freshAsset.status = 'quarantined';
          freshAsset.scanResult = 'Malware detected (ClamAV simulation match)';
        } else {
          freshAsset.status = 'uploaded';
          freshAsset.scanResult = 'Clean (No malware detected)';
        }
        await freshAsset.save();
      } catch (err) {
        console.error('Error running simulated background malware scan:', err);
      }
    }, 3000);

    return res.json({
      success: true,
      message: 'Xác nhận tải lên thành công, tệp đang được quét mã độc ẩn.'
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Returns check status of an asset file
 */
async function getAssetStatus(req, res, next) {
  try {
    const { fileAssetId } = req.params;
    const asset = await FileAsset.findById(fileAssetId).lean();
    if (!asset) {
      return res.status(404).json({ error: 'Tệp không tồn tại' });
    }
    return res.json({ success: true, status: asset.status, scanResult: asset.scanResult });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  requestUploadUrl,
  confirmUpload,
  getAssetStatus,
};
