import { Box, Button, HStack, Table, Text, VStack } from '@chakra-ui/react'

function UploadedFilesTable({
  files,
  isDeletingId,
  onRefresh,
  onDelete,
  onDownload,
}) {
  return (
    <Box borderWidth="1px" rounded="md" p={4}>
      <VStack align="stretch" spacing={4}>
        <HStack justify="space-between">
          <Text fontWeight="semibold">Uploaded Files</Text>
          <Button variant="outline" onClick={onRefresh}>
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
                    <HStack>
                      <Button
                        size="sm"
                        colorScheme="blue"
                        variant="outline"
                        onClick={() => onDownload(file.id)}
                      >
                        Download
                      </Button>

                      <Button
                        size="sm"
                        colorScheme="red"
                        onClick={() => onDelete(file.id)}
                        isLoading={isDeletingId === file.id}
                        loadingText="Deleting"
                      >
                        Delete
                      </Button>
                    </HStack>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        )}
      </VStack>
    </Box>
  )
}

export default UploadedFilesTable