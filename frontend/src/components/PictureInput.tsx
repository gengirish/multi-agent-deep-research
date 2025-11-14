import React, { useState, useEffect, useRef } from 'react'
import './PictureInput.css'

interface Props {
  onPictureCapture: (text: string) => void
  onReset?: () => void
  disabled?: boolean
}

export const PictureInput: React.FC<Props> = ({ onPictureCapture, onReset, disabled = false }) => {
  const [isStreaming, setIsStreaming] = useState(false)
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [extractedText, setExtractedText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [paperDetected, setPaperDetected] = useState(false)
  const [ocrProgress, setOcrProgress] = useState(0)
  const [processingStage, setProcessingStage] = useState<'ocr' | 'llm' | 'done'>('ocr')

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const detectionIntervalRef = useRef<number | null>(null)

  // Check if browser supports getUserMedia
  const isSupported = typeof navigator !== 'undefined' &&
    (navigator.mediaDevices && navigator.mediaDevices.getUserMedia)

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      stopCamera()
    }
  }, [])

  // Simple paper detection using edge detection
  const detectPaper = () => {
    if (!videoRef.current || !canvasRef.current) return false

    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')

    if (!ctx) return false

    // Set canvas size to match video
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    // Draw current video frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    // Get image data for edge detection
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const data = imageData.data

    // Simple edge detection: count high-contrast pixels
    let edgePixels = 0
    const threshold = 50

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]

      // Calculate grayscale
      const gray = 0.299 * r + 0.587 * g + 0.114 * b

      // Check if pixel is part of an edge (simple threshold)
      if (gray > 200 || gray < 50) {
        edgePixels++
      }
    }

    // If enough edges detected, likely a paper is in view
    const edgeRatio = edgePixels / (data.length / 4)
    return edgeRatio > 0.3 && edgeRatio < 0.7
  }

  const startCamera = async () => {
    if (disabled || !isSupported) return

    try {
      setIsStreaming(true)
      setError(null)
      setPaperDetected(false)

      // Request camera access
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment', // Use back camera on mobile
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      })

      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
      }

      // Start paper detection
      detectionIntervalRef.current = window.setInterval(() => {
        const detected = detectPaper()
        setPaperDetected(detected)
      }, 500) // Check every 500ms

    } catch (err: any) {
      let errorMessage = 'Failed to access camera'

      if (err.name === 'NotAllowedError') {
        errorMessage = 'Camera permission denied. Please allow camera access.'
      } else if (err.name === 'NotFoundError') {
        errorMessage = 'No camera found. Please connect a camera.'
      } else if (err.name === 'NotReadableError') {
        errorMessage = 'Camera is already in use by another application.'
      }

      setError(errorMessage)
      setIsStreaming(false)
    }
  }

  const stopCamera = () => {
    // Stop detection interval
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current)
      detectionIntervalRef.current = null
    }

    // Stop video stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }

    setIsStreaming(false)
    setPaperDetected(false)
  }

  const captureImage = () => {
    if (!videoRef.current || !canvasRef.current) return

    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')

    if (!ctx) return

    // Set canvas size to match video
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    // Capture current frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    // Convert to data URL
    const imageDataUrl = canvas.toDataURL('image/png')
    setCapturedImage(imageDataUrl)

    // Stop camera
    stopCamera()

    // Start OCR processing
    processOCR(imageDataUrl)
  }

  const preprocessImage = async (imageDataUrl: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      // Create a temporary canvas for preprocessing
      const tempCanvas = document.createElement('canvas')
      const tempCtx = tempCanvas.getContext('2d')
      if (!tempCtx) {
        resolve(imageDataUrl)
        return
      }

      // Create image from data URL
      const img = new Image()

      img.onload = () => {
        try {
          // Scale up image for better OCR (2x resolution)
          const scale = 2
          tempCanvas.width = img.width * scale
          tempCanvas.height = img.height * scale

          // Enable image smoothing for better quality
          tempCtx.imageSmoothingEnabled = true
          tempCtx.imageSmoothingQuality = 'high'

          // Draw scaled image
          tempCtx.drawImage(img, 0, 0, tempCanvas.width, tempCanvas.height)

          // Get image data
          const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height)
          const data = imageData.data

          // Step 1: Calculate average brightness for adaptive thresholding
          let totalBrightness = 0
          for (let i = 0; i < data.length; i += 4) {
            const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
            totalBrightness += gray
          }
          const avgBrightness = totalBrightness / (data.length / 4)

          // Step 2: Apply adaptive threshold based on average brightness
          // If image is dark, use lower threshold; if bright, use higher threshold
          const threshold = avgBrightness * 0.7 // 70% of average brightness

          // Step 3: Convert to high-contrast black and white
          for (let i = 0; i < data.length; i += 4) {
            // Calculate grayscale value
            const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]

            // Apply adaptive threshold
            const value = gray > threshold ? 255 : 0

            data[i] = value     // Red
            data[i + 1] = value // Green
            data[i + 2] = value // Blue
            // Alpha stays the same
          }

          // Step 4: Apply noise reduction (median filter simulation)
          // This helps clean up small artifacts
          const cleanedData = new Uint8ClampedArray(data)
          const width = tempCanvas.width
          const radius = 1 // 3x3 kernel

          for (let y = radius; y < tempCanvas.height - radius; y++) {
            for (let x = radius; x < tempCanvas.width - radius; x++) {
              const idx = (y * width + x) * 4

              // Sample neighborhood
              let sum = 0
              let count = 0
              for (let dy = -radius; dy <= radius; dy++) {
                for (let dx = -radius; dx <= radius; dx++) {
                  const nIdx = ((y + dy) * width + (x + dx)) * 4
                  sum += data[nIdx]
                  count++
                }
              }

              // Use average of neighborhood
              const avg = sum / count
              cleanedData[idx] = avg > 127 ? 255 : 0
              cleanedData[idx + 1] = avg > 127 ? 255 : 0
              cleanedData[idx + 2] = avg > 127 ? 255 : 0
            }
          }

          // Put processed image back
          const processedImageData = new ImageData(cleanedData, tempCanvas.width, tempCanvas.height)
          tempCtx.putImageData(processedImageData, 0, 0)

          // Return processed image as data URL
          resolve(tempCanvas.toDataURL('image/png'))
        } catch (error) {
          reject(error)
        }
      }

      img.onerror = (error) => {
        reject(error)
      }

      img.src = imageDataUrl
    })
  }

  const enhanceTextWithLLM = async (imageDataUrl: string, ocrText: string): Promise<string> => {
    try {
      // Call backend API for LLM enhancement
      const response = await fetch('http://localhost:8000/api/extract-image-text', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image: imageDataUrl,
          ocr_text: ocrText
        })
      })

      if (!response.ok) {
        throw new Error('LLM enhancement failed')
      }

      const data = await response.json()

      if (data.status === 'success' && data.extracted_text) {
        return data.extracted_text
      } else {
        throw new Error(data.error || 'Failed to enhance text')
      }
    } catch (err: any) {
      console.error('LLM Enhancement Error:', err)
      // Return OCR text as fallback
      return ocrText
    }
  }

  const processOCR = async (imageDataUrl: string) => {
    setIsProcessing(true)
    setError(null)
    setOcrProgress(0)
    setProcessingStage('ocr')

    try {
      // Step 1: OCR Processing
      setOcrProgress(5)
      const processedImage = await preprocessImage(imageDataUrl)

      // Dynamically import Tesseract
      const Tesseract = await import('tesseract.js')

      setOcrProgress(10)

      // Create a worker for better control
      const worker = await Tesseract.createWorker('eng', 1, {
        logger: (m: any) => {
          if (m.status === 'recognizing text') {
            setOcrProgress(10 + (m.progress * 35)) // OCR takes first 45%
          }
        }
      })

      // Set parameters for better OCR
      await worker.setParameters({
        tessedit_pageseg_mode: Tesseract.PSM.AUTO,
        preserve_interword_spaces: '1',
      })

      // Perform OCR
      const { data: { text } } = await worker.recognize(processedImage)

      // Terminate worker
      await worker.terminate()

      setOcrProgress(45)

      // Clean up the OCR text
      const cleanedOcrText = text
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/[^\w\s.,!?-]/g, '')

      console.log('OCR extracted:', cleanedOcrText)

      // Step 2: LLM Enhancement
      setProcessingStage('llm')
      setOcrProgress(50)

      const llmEnhancedText = await enhanceTextWithLLM(imageDataUrl, cleanedOcrText)

      console.log('LLM enhanced:', llmEnhancedText)

      setOcrProgress(100)
      setProcessingStage('done')

      // Use LLM-enhanced text if available, otherwise fall back to OCR
      const finalText = llmEnhancedText || cleanedOcrText

      if (finalText && finalText.length > 2) {
        setExtractedText(finalText)
        onPictureCapture(finalText)
      } else {
        setError('No clear text detected in the image. Please ensure the paper is well-lit and text is clearly visible, then try again.')
      }

    } catch (err: any) {
      setError('Failed to extract text from image. Please try again with better lighting and clearer text.')
      console.error('Processing Error:', err)
    } finally {
      setIsProcessing(false)
      setProcessingStage('done')
    }
  }

  const handleReset = () => {
    stopCamera()
    setCapturedImage(null)
    setExtractedText('')
    setError(null)
    setOcrProgress(0)

    if (onReset) {
      onReset()
    }
  }

  const handleRetake = () => {
    setCapturedImage(null)
    setExtractedText('')
    setError(null)
    setOcrProgress(0)
    startCamera()
  }

  if (!isSupported) {
    return (
      <div className="picture-input-unavailable" role="status">
        <span className="warning-icon">⚠️</span>
        <p>Camera access is not supported in your browser</p>
        <p className="hint">Please use a modern browser with camera support</p>
      </div>
    )
  }

  return (
    <div className="picture-input" role="region" aria-label="Picture input">
      {!isStreaming && !capturedImage && (
        <button
          type="button"
          onClick={startCamera}
          disabled={disabled}
          className="picture-button"
          aria-label="Start camera to picture your research query"
        >
          <span className="picture-icon">📷</span>
          <span className="picture-text">Picture Your Research Query</span>
        </button>
      )}

      {isStreaming && (
        <div className="camera-container">
          <div className="video-wrapper">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="video-preview"
              aria-label="Live camera feed"
            />
            {paperDetected && (
              <div className="paper-detected-overlay" aria-live="polite">
                <div className="detection-box">
                  <span className="detection-icon">✓</span>
                  <span>Paper Detected!</span>
                </div>
              </div>
            )}
          </div>

          <canvas ref={canvasRef} style={{ display: 'none' }} />

          <div className="camera-controls">
            <button
              type="button"
              onClick={captureImage}
              className={`capture-button ${paperDetected ? 'ready' : ''}`}
              aria-label="Capture image"
            >
              <span className="capture-icon">📸</span>
              <span>Capture</span>
            </button>
            <button
              type="button"
              onClick={stopCamera}
              className="cancel-button"
              aria-label="Cancel and stop camera"
            >
              <span className="cancel-icon">✕</span>
              <span>Cancel</span>
            </button>
          </div>

          <div className="camera-hint" role="status">
            <p>📝 <strong>Hybrid AI Text Extraction (OCR + GPT-4 Vision)</strong></p>
            <ul className="hint-list">
              <li>Hold paper straight and fill most of the frame</li>
              <li>Ensure bright, even lighting - avoid shadows</li>
              <li>Any handwriting style works - AI will clean it up!</li>
              <li>Keep camera steady and wait for focus</li>
              <li>Dark ink on white/light paper works best</li>
            </ul>
            {paperDetected && <p className="hint-success">✓ Paper detected! Ready to capture.</p>}
            <p className="hint-note">🤖 AI will automatically correct OCR mistakes and clean the text</p>
          </div>
        </div>
      )}

      {capturedImage && (
        <div className="captured-image-container">
          <div className="image-preview-wrapper">
            <img
              src={capturedImage}
              alt="Captured document"
              className="captured-preview"
            />
          </div>

          {isProcessing && (
            <div className="processing-indicator" role="status" aria-live="polite">
              <div className="spinner"></div>
              <p className="stage-text">
                {processingStage === 'ocr' && '🔍 Step 1/2: Running OCR on image...'}
                {processingStage === 'llm' && '🤖 Step 2/2: Enhancing with AI Vision (GPT-4)...'}
                {processingStage === 'done' && '✅ Processing complete!'}
              </p>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${ocrProgress}%` }}
                ></div>
              </div>
              <p className="progress-text">{Math.round(ocrProgress)}%</p>
              <p className="stage-description">
                {processingStage === 'ocr' && 'Extracting raw text from image...'}
                {processingStage === 'llm' && 'Correcting OCR errors and cleaning text...'}
              </p>
            </div>
          )}

          {extractedText && !isProcessing && (
            <div className="extracted-text-container" role="status" aria-live="polite">
              <div className="extracted-header">
                <span className="extracted-label">AI-Enhanced Text:</span>
                <span className="ai-badge">🤖 OCR + GPT-4 Vision</span>
              </div>
              <p className="extracted-text">{extractedText}</p>
              <p className="ocr-note">💡 This text was extracted using OCR and cleaned by AI. You can edit it below before submitting.</p>
            </div>
          )}

          {!isProcessing && (
            <div className="image-controls">
              <button
                type="button"
                onClick={handleRetake}
                className="retake-button"
                aria-label="Retake picture"
              >
                <span className="retake-icon">🔄</span>
                <span>Retake</span>
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="reset-button"
                aria-label="Reset picture input"
              >
                <span className="reset-icon">✕</span>
                <span>Clear</span>
              </button>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="picture-error" role="alert">
          <span className="error-icon">⚠️</span>
          <p>{error}</p>
        </div>
      )}
    </div>
  )
}
