require('dotenv').config();
const express = require('express');
const multer = require('multer');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');
const fs = require('fs');
const pdf = require('pdf-parse');

const app = express();

// multer 설정 수정
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 30 * 1024 * 1024 // 30MB
    }
});

// 정적 파일 제공
app.use(express.static('public'));

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
});

// 이미지 업로드 및 요약 API
app.post('/api/summarize', upload.single('file'), async (req, res) => {
    try {
        // 파일 존재 여부 확인
        if (!req.file) {
            console.error('No file uploaded');
            return res.status(400).json({ error: '파일이 없습니다.' });
        }

        // 파일 타입 확인
        console.log('File type:', req.file.mimetype);
        const fileType = req.file.mimetype;

        let fileContent;
        let messages = [];

        if (fileType === 'application/pdf') {
            try {
                const pdfData = await pdf(req.file.buffer);
                fileContent = pdfData.text;
                console.log('PDF content extracted:', fileContent.substring(0, 100) + '...');

                messages = [{
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: `다음 PDF 텍스트를 분석해주세요:\n\n${fileContent}\n\n다음 형식으로 답변해주세요:\n제목: [정확한 뉴스 제목]\n언론사: [언론사명]`
                        }
                    ]
                }];
            } catch (error) {
                console.error('PDF processing error:', error);
                return res.status(400).json({ 
                    error: 'PDF 파일 처리 중 오류가 발생했습니다.',
                    details: error.message 
                });
            }
        } else if (fileType.startsWith('image/')) {
            messages = [{
                role: "user",
                content: [
                    {
                        type: "text",
                        text: "이 뉴스 기사를 자세히 읽고 분석해주세요. 특히 다음 사항에 주의해주세요:\n\n" +
                              "1. 기사의 전체 맥락을 정확히 파악하세요.\n" +
                              "2. 오타나 잘못된 단어 사용이 없도록 주의하세요.\n" +
                              "3. 한자어나 전문용어는 정확한 한글 표기를 사용하세요.\n\n" +
                              "분석 후 다음 형식으로만 답변해주세요:\n" +
                              "제목: [정확한 뉴스 제목]\n" +
                              "언론사: [언론사명]"
                    },
                    {
                        type: "image",
                        source: {
                            type: "base64",
                            media_type: req.file.mimetype,
                            data: req.file.buffer.toString('base64')
                        }
                    }
                ]
            }];
        } else {
            console.error('Unsupported file type:', fileType);
            return res.status(400).json({ error: '지원하지 않는 파일 형식입니다.' });
        }

        // API 호출 전 로그
        console.log('Calling Anthropic API...');

        // Anthropic API 호출
        const infoMessage = await anthropic.messages.create({
            model: "claude-3-sonnet-20240229",
            max_tokens: 1024,
            messages: messages
        });

        // API 응답 로그
        console.log('Anthropic API response:', infoMessage.content[0].text);

        // 응답 파싱
        const infoText = infoMessage.content[0].text;
        const headlineMatch = infoText.match(/제목:\s*(.*?)(?=\n|$)/);
        const pressMatch = infoText.match(/언론사:\s*(.*?)(?=\n|$)/);

        if (!headlineMatch || !pressMatch) {
            console.error('Failed to parse response:', infoText);
            throw new Error('응답 파싱 실패');
        }

        const headline = headlineMatch[1].trim();
        const press = pressMatch[1].trim();

        // 요약 생성
        const summaryMessage = await anthropic.messages.create({
            model: "claude-3-sonnet-20240229",
            max_tokens: 1024,
            messages: [{
                role: "user",
                content: fileType === 'application/pdf' 
                    ? [{ 
                        type: "text", 
                        text: `다음 PDF 내용을 요약해주세요. 번호나 구분 없이 자연스럽게 연결되는 2개의 문장으로 작성해주세요:\n\n${fileContent}` 
                      }]
                    : [
                        { 
                            type: "text", 
                            text: "이 뉴스 기사를 요약해주세요. 번호나 구분 없이 자연스럽게 연결되는 2개의 문장으로 작성해주세요. 문장 사이에는 적절한 접속사나 연결어를 사용하여 자연스럽게 이어지도록 해주세요." 
                        },
                        {
                            type: "image",
                            source: {
                                type: "base64",
                                media_type: req.file.mimetype,
                                data: req.file.buffer.toString('base64')
                            }
                        }
                    ]
            }]
        });

        const summary = summaryMessage.content[0].text
            .replace(/^\d+[\.\)]\s*/gm, '')  // 번호 제거
            .replace(/\n/g, ' ')  // 줄바꿈 제거
            .trim();

        // 최종 응답
        res.json({
            headline,
            press,
            summary
        });

    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ 
            error: '처리 중 오류가 발생했습니다.',
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
}); 