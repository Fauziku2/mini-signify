import { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import {
  Box,
  Button,
  Heading,
  HStack,
  Input,
  Table,
  Text,
  VStack,
} from '@chakra-ui/react'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL

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
      const response = await axios.get(`${API_BASE_URL}/files`)
      setFiles(response.data)
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

    const formData = new FormData()
    formData.append('file', selectedFile)

    try {
      setIsUploading(true)
      setErrorMessage('')

      await axios.post(`${API_BASE_URL}/files`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })

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
      await axios.delete(`${API_BASE_URL}/files/${id}`)
      await fetchFiles()
    } catch (error) {
      setErrorMessage('Failed to delete file')
      console.error(error)
    } finally {
      setIsDeletingId(null)
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
            Upload, view, and delete PDF files
          </Text>
        </Box>

        <Box borderWidth="1px" rounded="md" p={4}>
          <VStack align="stretch" spacing={4}>
            <Text fontWeight="semibold">Upload PDF</Text>

            <Input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              onChange={handleFileChange}
              p={1}
            />

            {selectedFile && (
              <Text fontSize="sm" color="gray.600">
                Selected file: {selectedFile.name}
              </Text>
            )}

            <HStack>
              <Button
                colorScheme="blue"
                onClick={handleUpload}
                isLoading={isUploading}
                loadingText="Uploading"
              >
                Upload
              </Button>
            </HStack>
          </VStack>
        </Box>

        {errorMessage && (
          <Box bg="red.50" borderWidth="1px" borderColor="red.200" rounded="md" p={3}>
            <Text color="red.600">{errorMessage}</Text>
          </Box>
        )}

        <Box borderWidth="1px" rounded="md" p={4}>
          <VStack align="stretch" spacing={4}>
            <HStack justify="space-between">
              <Text fontWeight="semibold">Uploaded Files</Text>
              <Button variant="outline" onClick={fetchFiles}>
                Refresh
              </Button>
            </HStack>

            {files.length === 0 ? (
              <Text color="gray.500">No files uploaded yet</Text>
            ) : (
              <Table.Root size="sm" variant="outline">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeader>File Name</Table.ColumnHeader>
                    <Table.ColumnHeader>MIME Type</Table.ColumnHeader>
                    <Table.ColumnHeader>Size (bytes)</Table.ColumnHeader>
                    <Table.ColumnHeader>Created At</Table.ColumnHeader>
                    <Table.ColumnHeader>Action</Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {files.map((file) => (
                    <Table.Row key={file.id}>
                      <Table.Cell>{file.originalFileName}</Table.Cell>
                      <Table.Cell>{file.mimeType}</Table.Cell>
                      <Table.Cell>{file.size}</Table.Cell>
                      <Table.Cell>
                        {new Date(file.createdAt).toLocaleString()}
                      </Table.Cell>
                      <Table.Cell>
                        <Button
                          size="sm"
                          colorScheme="red"
                          onClick={() => handleDelete(file.id)}
                          isLoading={isDeletingId === file.id}
                          loadingText="Deleting"
                        >
                          Delete
                        </Button>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            )}
          </VStack>
        </Box>
      </VStack>
    </Box>
  )
}

export default App