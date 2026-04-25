import { useEffect, useRef, useState } from 'react'
import { Box, Heading, Text, VStack } from '@chakra-ui/react'
import UploadPdfForm from './components/UploadPdfForm'
import UploadedFilesTable from './components/UploadedFilesTable'
import {
  deleteFile,
  getDownloadUrl,
  getFiles,
  uploadFile,
} from './api/files'

function App() {
  const [files, setFiles] = useState([])
  const [selectedFile, setSelectedFile] = useState(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isDeletingId, setIsDeletingId] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')
  const fileInputRef = useRef(null)

  const fetchFiles = async () => {
    try {
      setErrorMessage('')
      const data = await getFiles()
      setFiles(data)
    } catch (error) {
      setErrorMessage('Failed to load files')
      console.error(error)
    }
  }

  useEffect(() => {
    fetchFiles()
  }, [])

  const handleFileChange = (event) => {
    const file = event.target.files?.[0] || null
    setSelectedFile(file)
  }

  const handleUpload = async () => {
    if (!selectedFile) {
      setErrorMessage('Please select a PDF file first')
      return
    }

    try {
      setIsUploading(true)
      setErrorMessage('')

      await uploadFile(selectedFile)

      setSelectedFile(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }

      await fetchFiles()
    } catch (error) {
      setErrorMessage(
        error?.response?.data?.message || 'Failed to upload file',
      )
      console.error(error)
    } finally {
      setIsUploading(false)
    }
  }

  const handleDelete = async (id) => {
    try {
      setIsDeletingId(id)
      setErrorMessage('')
      await deleteFile(id)
      await fetchFiles()
    } catch (error) {
      setErrorMessage('Failed to delete file')
      console.error(error)
    } finally {
      setIsDeletingId(null)
    }
  }

  const handleDownload = async (id) => {
    try {
      setErrorMessage('')
      const { downloadUrl } = await getDownloadUrl(id)

      window.open(downloadUrl, '_blank')
    } catch (error) {
      setErrorMessage('Failed to download file')
      console.error(error)
    }
  }

  return (
    <Box minH="100vh" bg="gray.50" py={10} px={4}>
      <VStack
        spacing={6}
        align="stretch"
        maxW="5xl"
        mx="auto"
        bg="white"
        p={8}
        rounded="lg"
        shadow="md"
      >
        <Box>
          <Heading size="lg">Mini Signify</Heading>
          <Text mt={2} color="gray.600">
            Upload, view, download, and delete PDF files
          </Text>
        </Box>

        <UploadPdfForm
          selectedFile={selectedFile}
          isUploading={isUploading}
          onFileChange={handleFileChange}
          onUpload={handleUpload}
          fileInputRef={fileInputRef}
        />

        {errorMessage && (
          <Box
            bg="red.50"
            borderWidth="1px"
            borderColor="red.200"
            rounded="md"
            p={3}
          >
            <Text color="red.600">{errorMessage}</Text>
          </Box>
        )}

        <UploadedFilesTable
          files={files}
          isDeletingId={isDeletingId}
          onRefresh={fetchFiles}
          onDelete={handleDelete}
          onDownload={handleDownload}
        />
      </VStack>
    </Box>
  )
}

export default App