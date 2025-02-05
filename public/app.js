document.addEventListener('DOMContentLoaded', function() {
    const fileInput = document.getElementById('fileInput');
    const dropZone = document.getElementById('dropZone');
    const summaryResults = document.getElementById('summaryResults');
    let processingFiles = new Set(); // 처리 중인 파일 추적

    // 토스트 메시지 표시 함수
    function showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast show ${type}`;
        setTimeout(() => {
            toast.className = 'toast';
        }, 3000);
    }

    // 파일 크기 검증
    function validateFile(file) {
        const maxSize = 5 * 1024 * 1024; // 5MB
        const allowedTypes = [
            'image/jpeg', 
            'image/png', 
            'image/gif',
            'application/pdf'
        ];

        if (!allowedTypes.includes(file.type)) {
            showToast('지원하지 않는 파일 형식입니다. JPG, PNG, GIF, PDF 파일만 업로드 가능합니다.', 'error');
            return false;
        }

        if (file.size > maxSize) {
            showToast('파일 크기가 너무 큽니다. 5MB 이하의 파일만 업로드 가능합니다.', 'error');
            return false;
        }

        return true;
    }

    // 드래그 앤 드롭 이벤트 처리
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', async (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        
        const files = Array.from(e.dataTransfer.files);
        handleMultipleFiles(files);
    });

    // 클릭 업로드 처리
    dropZone.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', () => {
        const files = Array.from(fileInput.files);
        handleMultipleFiles(files);
        fileInput.value = ''; // 입력 초기화
    });

    // 다중 파일 처리 함수
    async function handleMultipleFiles(files) {
        const validFiles = files.filter(file => validateFile(file));
        
        if (validFiles.length === 0) {
            return;
        }

        if (validFiles.length > 1) {
            showToast(`${validFiles.length}개의 파일을 처리합니다.`, 'info');
        }

        // 모든 파일을 동시에 처리
        const promises = validFiles.map(file => uploadFile(file));
        
        try {
            await Promise.all(promises);
            showToast('모든 파일 처리가 완료되었습니다.', 'success');
        } catch (error) {
            console.error('Some files failed to process:', error);
            showToast('일부 파일 처리 중 오류가 발생했습니다.', 'error');
        }
    }

    async function uploadFile(file) {
        if (processingFiles.has(file.name)) {
            showToast(`${file.name}이(가) 이미 처리 중입니다.`, 'info');
            return;
        }

        processingFiles.add(file.name);
        
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'loading';
        loadingDiv.innerHTML = `
            <div class="loading-spinner"></div>
            <p class="loading-text">${file.name} 처리 중...</p>
        `;
        summaryResults.insertBefore(loadingDiv, summaryResults.firstChild);

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('fileType', file.type); // 파일 타입 정보 추가

            const response = await fetch('/api/summarize', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            loadingDiv.remove();
            
            const summaryDiv = document.createElement('div');
            summaryDiv.className = 'summary-item';
            
            summaryDiv.innerHTML = `
                <div class="news-header">
                    <div class="file-type-indicator ${file.type.includes('pdf') ? 'pdf' : 'image'}">
                        ${file.type.includes('pdf') ? 'PDF' : 'IMAGE'}
                    </div>
                    <h3 class="news-headline">${data.headline}</h3>
                    <p class="news-press">${data.press}</p>
                    <p class="file-name">${file.name}</p>
                </div>
                <div class="news-summary">
                    <p class="summary-label">뉴스요약</p>
                    <p class="summary-content">${data.summary}</p>
                </div>
            `;
            
            summaryResults.insertBefore(summaryDiv, summaryResults.firstChild);
        } catch (error) {
            console.error('Error:', error);
            loadingDiv.remove();
            showToast(`${file.name} 처리 중 오류가 발생했습니다.`, 'error');
        } finally {
            processingFiles.delete(file.name);
        }
    }
}); 