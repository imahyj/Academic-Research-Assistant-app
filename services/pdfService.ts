

// This assumes pdfjsLib is available globally from the CDN script in index.html
declare const pdfjsLib: any;

export const parsePdf = async (file: File): Promise<string> => {
  const fileReader = new FileReader();

  return new Promise((resolve, reject) => {
    fileReader.onload = async (event) => {
      if (!event.target?.result) {
        return reject(new Error("Failed to read file"));
      }
      
      try {
        const typedarray = new Uint8Array(event.target.result as ArrayBuffer);
        const pdf = await pdfjsLib.getDocument(typedarray).promise;
        let fullText = '';
        
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          
          // Coordinate-aware extraction
          // Sort items by Y (descending) then X (ascending) to handle some PDF irregularities
          const items = textContent.items.map((item: any) => ({
             str: item.str,
             x: item.transform[4],
             y: item.transform[5],
             height: item.height || 10,
             width: item.width,
             hasEOL: item.hasEOL
          }));

          let pageText = '';
          let lastY = -1;
          let lastX = -1;
          
          // Basic sort: Top to bottom, Left to right
          items.sort((a: any, b: any) => {
              if (Math.abs(a.y - b.y) > a.height * 0.5) {
                  return b.y - a.y; // Different lines
              }
              return a.x - b.x; // Same line
          });

          for (const item of items) {
             if (lastY !== -1) {
                 const dy = Math.abs(item.y - lastY);
                 // Check for new line (if vertical difference is significant)
                 if (dy > item.height * 0.6) {
                     // Check for paragraph break (larger gap)
                     if (dy > item.height * 1.6) {
                         // Paragraph break
                         // Check for trailing hyphen on previous block before breaking
                         if (pageText.trim().endsWith('-')) {
                             pageText = pageText.trim().slice(0, -1); // Remove hyphen
                             // Don't add newline, join words
                         } else {
                             pageText += '\n\n';
                         }
                     } else {
                         // Standard line break
                         if (pageText.trim().endsWith('-')) {
                             pageText = pageText.trim().slice(0, -1); // Remove hyphen, join words
                         } else {
                             pageText += ' '; // Just a space for wrapping
                         }
                     }
                 } else {
                     // Same line, check for space
                     if (lastX !== -1 && item.x > lastX + (item.height * 0.2)) {
                         // Only add space if the string itself doesn't start with one
                         if (!item.str.startsWith(' ') && !pageText.endsWith(' ')) {
                             pageText += ' ';
                         }
                     }
                 }
             }
             
             pageText += item.str;
             lastY = item.y;
             lastX = item.x + item.width;
          }
          
          fullText += pageText + '\n\n';
        }
        
        resolve(fullText);

      } catch (error) {
        console.error('Error parsing PDF:', error);
        reject(new Error('Could not get text from PDF. The file may be image-based or corrupted.'));
      }
    };
    
    fileReader.onerror = (error) => {
      reject(error);
    };

    fileReader.readAsArrayBuffer(file);
  });
};