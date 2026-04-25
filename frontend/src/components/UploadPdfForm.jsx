import { Box, Button, HStack, Input, Text, VStack } from '@chakra-ui/react'

function UploadPdfForm({
  selectedFile,
  isUploading,
  onFileChange,
  onUpload,
  fileInputRef,
}) {
  return (
    <Box borderWidth="1px" rounded="md" p={4}>
      <VStack align="stretch" spacing={4}>
        <Text fontWeight="semibold">Upload PDF</Text>

        <Input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          onChange={onFileChange}
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
            onClick={onUpload}
            isLoading={isUploading}
            loadingText="Uploading"
          >
            Upload
          </Button>
        </HStack>
      </VStack>
    </Box>
  )
}

export default UploadPdfForm