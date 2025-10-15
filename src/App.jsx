import React, { useState, useEffect } from 'react';
import { Search, MapPin } from 'lucide-react';

// XML Parser
const parseXML = (xmlString) => {
  const parser = new DOMParser();
  return parser.parseFromString(xmlString, 'text/xml');
};

const parseManuscript = (xmlDoc, filename) => {
  console.log('Parsing XML:', filename);

  // Parse Info section
  const infoEl = xmlDoc.querySelector('Info');
  const titleEl = infoEl?.querySelector('title');
  const editorEl = infoEl?.querySelector('editor');
  const emailEl = infoEl?.querySelector('email');
  const publisherEl = infoEl?.querySelector('publisher');
  const pubPlaceEl = infoEl?.querySelector('pubPlace');
  const dateEl = infoEl?.querySelector('publish_date');

  const sourceDesc = infoEl?.querySelector('SourceDesc');
  const sourceStatusEl = sourceDesc?.querySelector('sourceStatus');
  const locationEl = sourceDesc?.querySelector('location');
  const dateOriginEl = sourceDesc?.querySelector('date');
  const additionalEl = sourceDesc?.querySelector('additionalDetail');

  // Parse content section
  const contentEl = xmlDoc.querySelector('content');
  const itemElements = contentEl?.querySelectorAll(':scope > item') || [];

  console.log(`Found ${itemElements.length} paragraphs in ${filename}`);

  const paragraphs = Array.from(itemElements).map((item, idx) => {
    const index = item.querySelector('index')?.textContent || idx + 1;
    const text = item.querySelector('text')?.textContent || '';
    const translation = item.querySelector('translation')?.textContent || '';

    // Parse tags (words with annotations)
    const tagsEl = item.querySelector('tags');
    const tagItems = tagsEl?.querySelectorAll(':scope > item') || [];

    const words = Array.from(tagItems).map(tagItem => ({
      ogeo: tagItem.querySelector('ogeo')?.textContent || '',
      lemma: tagItem.querySelector('lemma')?.textContent || '',
      grammar: tagItem.querySelector('gram')?.textContent || '',
      english: tagItem.querySelector('eng')?.textContent || '',
      greek: tagItem.querySelector('grc')?.textContent || ''
    }));

    console.log(`Paragraph ${index}: ${words.length} words`);

    return { index, translation, words, text };
  });

  console.log(`Total paragraphs parsed: ${paragraphs.length}`);

  return {
    filename,
    title: titleEl?.textContent || 'Untitled',
    editor: editorEl?.textContent || '',
    email: emailEl?.textContent || '',
    publisher: publisherEl?.textContent || '',
    pubPlace: pubPlaceEl?.textContent || '',
    publishDate: dateEl?.textContent || '',
    sourceStatus: sourceStatusEl?.textContent || '',
    location: locationEl?.textContent || '',
    date: dateOriginEl?.textContent || '',
    additionalDetail: additionalEl?.textContent || '',
    paragraphs,
    notes: []
  };
};

// Merge CSV annotations with XML structure
const mergeAnnotations = (manuscript, csvData) => {
  if (!csvData || csvData.length === 0) return manuscript;

  // Create annotation lookup by Georgian word
  const annotationMap = new Map();
  csvData.forEach(row => {
    if (row.O) {
      const key = row.O.trim();
      if (!annotationMap.has(key)) {
        annotationMap.set(key, []);
      }
      annotationMap.get(key).push({
        lemma: row.Lemma || '',
        grammar: row.Gram || '',
        english: row.Eng || '',
        greek: row.Grc || ''
      });
    }
  });

  // Merge annotations into manuscript words
  manuscript.paragraphs = manuscript.paragraphs.map(para => {
    para.words = para.words.map(word => {
      const annotations = annotationMap.get(word.ogeo);
      if (annotations && annotations.length > 0) {
        const annot = annotations.shift(); // Use first match and remove it
        return {
          ...word,
          lemma: annot.lemma || word.lemma,
          grammar: annot.grammar || word.grammar,
          english: annot.english || word.english,
          greek: annot.greek || word.greek
        };
      }
      return word;
    });
    return para;
  });

  return manuscript;
};

const App = () => {
  const [view, setView] = useState('home');
  const [manuscripts, setManuscripts] = useState([]);
  const [currentManuscript, setCurrentManuscript] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadManuscripts = async () => {
      try {
        const files = [
          { xml: 'O.xml', csv: 'modified_anot_O.csv', title: 'ოშკის ბიბლია (Ath.1)' },
          { xml: 'I.xml', csv: 'modified_anot_I.csv', title: 'A-570' },
          { xml: 'D.xml', csv: 'modified_anot_D.csv', title: 'H-885' },
          { xml: 'M.xml', csv: 'modified_anot_M.csv', title: 'm7125' },
          { xml: 'F.xml', csv: 'modified_anot_F.csv', title: 'A-646' }
        ];

        const Papa = await import('papaparse');

        const promises = files.map(async (file) => {
          try {
            // Load XML
            const xmlResponse = await fetch(`${import.meta.env.BASE_URL}manuscripts/${file.xml}`);
            const xmlText = await xmlResponse.text();
            const xmlDoc = parseXML(xmlText);
            let manuscript = parseManuscript(xmlDoc, file.xml);
            manuscript.title = file.title;

            // Load CSV annotations
            try {
              const csvResponse = await fetch(`${import.meta.env.BASE_URL}manuscripts/${file.csv}`);
              const csvText = await csvResponse.text();
              const result = Papa.parse(csvText, {
                header: true,
                skipEmptyLines: true
              });
              manuscript = mergeAnnotations(manuscript, result.data);
            } catch (csvError) {
              console.log(`No CSV for ${file.xml}, using XML annotations only`);
            }

            return manuscript;
          } catch (error) {
            console.error(`Error loading ${file.xml}:`, error);
            return null;
          }
        });

        const loadedManuscripts = await Promise.all(promises);
        const validManuscripts = loadedManuscripts.filter(m => m !== null);
        setManuscripts(validManuscripts);
        setLoading(false);
      } catch (error) {
        console.error('Error loading manuscripts:', error);
        setLoading(false);
      }
    };

    loadManuscripts();
  }, []);

  const handleSearch = () => {
    if (!searchQuery.trim()) return;

    const results = [];
    manuscripts.forEach(manuscript => {
      const manuscriptResults = [];

      manuscript.paragraphs.forEach(paragraph => {
        paragraph.words.forEach((word, wordIndex) => {
          if (word.ogeo && word.ogeo.toLowerCase().includes(searchQuery.toLowerCase())) {
            const leftContext = paragraph.words.slice(Math.max(0, wordIndex - 3), wordIndex)
              .map(w => w.ogeo).join(' ');
            const rightContext = paragraph.words.slice(wordIndex + 1, wordIndex + 4)
              .map(w => w.ogeo).join(' ');

            manuscriptResults.push({
              word: word.ogeo,
              leftContext,
              rightContext,
              paragraphIndex: paragraph.index,
              file: manuscript.filename
            });
          }
        });
      });

      if (manuscriptResults.length > 0) {
        results.push({
          manuscript,
          results: manuscriptResults,
          count: manuscriptResults.length
        });
      }
    });

    setSearchResults(results);
    setView('search');
  };

  const handleSearchKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const viewManuscript = (manuscript) => {
    setCurrentManuscript(manuscript);
    setView('manuscript');
  };

  const goHome = () => {
    setView('home');
    setCurrentManuscript(null);
    setSearchQuery('');
  };

  const Navigation = () => (
    <nav className="bg-gray-100 shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-1">
            <button onClick={goHome} className="text-gray-700 hover:text-blue-600 px-3 py-2">
              საწყისი
            </button>
            <button onClick={() => setView('about')} className="text-gray-700 hover:text-blue-600 px-3 py-2">
              პროექტის შესახებ
            </button>
            <span className="text-gray-400 px-3 py-2 cursor-not-allowed">
              ხელნაწერები
            </span>
            <span className="text-gray-400 px-3 py-2 cursor-not-allowed flex items-center space-x-1">
              <MapPin className="w-4 h-4" />
              <span>რუკა</span>
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={handleSearchKeyPress}
              placeholder="..."
              className="px-3 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
            <button
              onClick={handleSearch}
              className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
            >
              ძიება
            </button>
          </div>
        </div>
      </div>
    </nav>
  );

  const HomeView = () => (
    <div
      className="min-h-screen bg-cover bg-center bg-no-repeat relative"
      style={{ backgroundImage: `url(${import.meta.env.BASE_URL}images/tobit-cover.png)` }}
    >
      {/* Dark overlay for readability */}
      <div className="absolute inset-0 bg-black bg-opacity-50"></div>

      {/* Content */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 py-12">
        <h1 className="text-6xl font-bold text-white mb-16 text-center drop-shadow-lg">
          ტობის წიგნი
        </h1>

        <ul className="space-y-4 text-center">
          {manuscripts.length > 0 ? (
            manuscripts.map((manuscript, idx) => (
              <li key={idx}>
                <button
                  onClick={() => viewManuscript(manuscript)}
                  className="text-white hover:text-yellow-300 text-2xl font-medium transition-colors drop-shadow-lg bg-transparent border-none cursor-pointer"
                >
                  {manuscript.title}
                </button>
              </li>
            ))
          ) : (
            <li className="text-white text-center py-4 text-xl drop-shadow-lg">
              იტვირთება ხელნაწერები...
            </li>
          )}
        </ul>
      </div>
    </div>
  );

  const ManuscriptView = () => {
    if (!currentManuscript) return null;

    const [hoveredWord, setHoveredWord] = useState(null);
    const [selectedChapter, setSelectedChapter] = useState('');

    // Extract chapters from paragraphs - more flexible detection
    const isChapterHeader = (para) => {
      // Method 1: text is "თავი"
      if (para.text === 'თავი') return true;

      // Method 2: index is Roman numeral (I, II, III, etc.) and has few/no words
      const romanNumeralPattern = /^M{0,4}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/i;
      if (romanNumeralPattern.test(para.index) && (!para.words || para.words.length === 0)) {
        return true;
      }

      // Method 3: Has "თავი" in the text and very few words
      if (para.text && para.text.includes('თავი') && (!para.words || para.words.length <= 2)) {
        return true;
      }

      return false;
    };

    const chapters = currentManuscript.paragraphs
      .filter(para => isChapterHeader(para))
      .map(para => para.index);

    const scrollToChapter = (chapterIndex) => {
      setSelectedChapter(chapterIndex);
      const element = document.getElementById(`chapter-${chapterIndex}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };

    console.log('Displaying manuscript:', currentManuscript.title);
    console.log('Number of paragraphs:', currentManuscript.paragraphs.length);
    console.log('Chapters found:', chapters);

    return (
      <div className="bg-gray-50 min-h-screen">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="mb-4 flex items-center justify-between">
            <button
              onClick={goHome}
              className="text-blue-600 hover:text-blue-800 hover:underline"
            >
              ← უკან საწყისზე
            </button>

            {chapters.length > 0 && (
              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium text-gray-700">თავი:</label>
                <select
                  value={selectedChapter}
                  onChange={(e) => scrollToChapter(e.target.value)}
                  className="px-3 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">აირჩიეთ თავი</option>
                  {chapters.map((ch, idx) => (
                    <option key={idx} value={ch}>
                      თავი {ch}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-12 gap-4">
            {/* Left Sidebar */}
            <div className="col-span-12 lg:col-span-3">
              <div className="bg-white rounded-lg shadow p-4 text-sm sticky top-4">
                <div className="mb-3">
                  <strong>დასახელება:</strong>
                  <p className="text-gray-700 mt-1">{currentManuscript.title}</p>
                </div>
                {currentManuscript.editor && (
                  <div className="mb-3">
                    <strong>რედაქტორი:</strong>
                    <p className="text-gray-700 mt-1">{currentManuscript.editor}</p>
                  </div>
                )}
                {currentManuscript.email && (
                  <div className="mb-3">
                    <strong>ელ-ფოსტა:</strong>
                    <p className="text-gray-700 mt-1">{currentManuscript.email}</p>
                  </div>
                )}
                {currentManuscript.publisher && (
                  <div className="mb-3">
                    <strong>გამომცემელი:</strong>
                    <p className="text-gray-700 mt-1">{currentManuscript.publisher}</p>
                  </div>
                )}
                {currentManuscript.pubPlace && (
                  <div className="mb-3">
                    <strong>გამოცემის ადგილი:</strong>
                    <p className="text-gray-700 mt-1">{currentManuscript.pubPlace}</p>
                  </div>
                )}
                {currentManuscript.publishDate && (
                  <div className="mb-3">
                    <strong>თარიღი:</strong>
                    <p className="text-gray-700 mt-1">{currentManuscript.publishDate}</p>
                  </div>
                )}
                {currentManuscript.sourceStatus && (
                  <div className="mb-3">
                    <strong>წყარო:</strong>
                    <p className="text-gray-700 mt-1">{currentManuscript.sourceStatus}</p>
                  </div>
                )}
                {currentManuscript.location && (
                  <div className="mb-3">
                    <strong>ადგილმდებარეობა:</strong>
                    <p className="text-gray-700 mt-1">{currentManuscript.location}</p>
                  </div>
                )}
                {currentManuscript.date && (
                  <div className="mb-3">
                    <strong>დათარიღება:</strong>
                    <p className="text-gray-700 mt-1">{currentManuscript.date}</p>
                  </div>
                )}
                {currentManuscript.additionalDetail && (
                  <div className="mb-3">
                    <strong>დამატებითი ინფორმაცია:</strong>
                    <p className="text-gray-700 mt-1 whitespace-pre-line">{currentManuscript.additionalDetail}</p>
                  </div>
                )}

                {/* Chapter Navigation in Sidebar */}
                {chapters.length > 0 && (
                  <div className="mt-6 pt-4 border-t border-gray-200">
                    <strong className="block mb-2">თავები:</strong>
                    <div className="space-y-1">
                      {chapters.map((ch, idx) => (
                        <button
                          key={idx}
                          onClick={() => scrollToChapter(ch)}
                          className="block w-full text-left px-2 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        >
                          თავი {ch}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Center */}
            <div className="col-span-12 lg:col-span-6">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div><h1 className="text-2xl font-bold">ქართული</h1></div>
                <div><h1 className="text-2xl font-bold">ბერძნული</h1></div>
              </div>

              {currentManuscript.paragraphs.length > 0 ? (
                currentManuscript.paragraphs.map((para, idx) => {
                  // Check if this is a chapter header
                  const isChapter = isChapterHeader(para);

                  if (isChapter) {
                    return (
                      <div
                        key={idx}
                        id={`chapter-${para.index}`}
                        className="mb-6 mt-8 scroll-mt-4"
                      >
                        <div className="border-b-2 border-gray-300 pb-2">
                          <h2 className="text-xl font-semibold text-gray-800 text-center">
                            თავი {para.index}
                          </h2>
                        </div>
                      </div>
                    );
                  }

                  // Regular paragraph
                  return (
                    <div key={idx} className="mb-6">
                      <div className="font-bold text-gray-900 mb-2">{para.index}</div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white p-3 rounded">
                          <p className="text-base leading-relaxed">
                            {para.words && para.words.length > 0 ? (
                              para.words.map((word, wIdx) => (
                                <span key={wIdx} className="relative inline-block">
                                  <span
                                    className="cursor-help hover:bg-yellow-200 transition-colors px-0.5 relative"
                                    onMouseEnter={() => setHoveredWord(`${idx}-${wIdx}`)}
                                    onMouseLeave={() => setHoveredWord(null)}
                                  >
                                    {word.ogeo}
                                    {hoveredWord === `${idx}-${wIdx}` && (word.lemma || word.grammar || word.english || word.greek) && (
                                      <span className="absolute z-50 bottom-full left-0 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded shadow-lg whitespace-nowrap pointer-events-none">
                                        {word.lemma && <div><strong>Lemma:</strong> {word.lemma}</div>}
                                        {word.grammar && <div><strong>Grammar:</strong> {word.grammar}</div>}
                                        {word.english && <div><strong>English:</strong> {word.english}</div>}
                                        {word.greek && <div><strong>Greek:</strong> {word.greek}</div>}
                                      </span>
                                    )}
                                  </span>
                                  {' '}
                                </span>
                              ))
                            ) : (
                              <span className="text-gray-400">{para.text || 'ტექსტი არ არის ხელმისაწვდომი'}</span>
                            )}
                          </p>
                        </div>

                        <div className="bg-yellow-50 p-3 rounded">
                          <p className="text-base leading-relaxed italic">
                            {para.translation || '—'}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-yellow-800 mb-2">ტექსტი ვერ მოიძებნა</h3>
                  <p className="text-yellow-700 mb-2">
                    XML ფაილი ვერ მოიძებნა ან არასწორი სტრუქტურის აქვს.
                  </p>
                  <p className="text-sm text-yellow-600">
                    გახსენით ბრაუზერის Console (F12) დამატებითი ინფორმაციისთვის.
                  </p>
                </div>
              )}
            </div>

            {/* Right Sidebar */}
            <div className="col-span-12 lg:col-span-3">
              <div className="bg-white rounded-lg shadow p-4 sticky top-4">
                <h2 className="text-xl font-bold mb-4">კომენტარი</h2>
                {currentManuscript.notes && currentManuscript.notes.length > 0 ? (
                  <div className="space-y-3 text-sm">
                    {currentManuscript.notes.map((note, idx) => (
                      <p key={idx} className="text-gray-700">
                        {note.count}. {note.note}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">კომენტარები არ არის</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const SearchView = () => (
    <div className="bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {searchResults.length > 0 ? (
          searchResults.map((result, idx) => (
            <div key={idx} className="bg-white rounded-lg shadow-md mb-6 p-6">
              <h4 className="text-lg font-semibold mb-4">
                ტექსტში:{' '}
                <button
                  onClick={() => viewManuscript(result.manuscript)}
                  className="text-blue-600 hover:text-blue-800 hover:underline"
                >
                  {result.manuscript.title}
                </button>
                {' '}ნაპოვნია {result.count} შემთხვევა:
              </h4>

              <div className="space-y-2">
                {result.results.map((item, itemIdx) => (
                  <div key={itemIdx} className="grid grid-cols-12 gap-2 py-2 border-b border-gray-100 last:border-0">
                    <div className="col-span-5 text-right text-gray-600">{item.leftContext}</div>
                    <div className="col-span-2 text-center">
                      <button
                        onClick={() => viewManuscript(result.manuscript)}
                        className="text-blue-600 hover:text-blue-800 font-semibold"
                      >
                        {item.word}
                      </button>
                    </div>
                    <div className="col-span-5 text-left text-gray-600">{item.rightContext}</div>
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
            <p className="text-yellow-800">
              სიტყვა <strong>"{searchQuery}"</strong> არ მოიძებნა
            </p>
          </div>
        )}
      </div>
    </div>
  );

  const AboutView = () => (
    <div className="bg-gray-50 min-h-screen">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-md p-8">
          <h2 className="text-2xl font-bold mb-4">პროექტის შესახებ</h2>
          <div className="prose max-w-none space-y-4 text-gray-700">
            <p>
              პროექტი „ტობის წიგნის მრავალენოვანი ანოტირებული ელექტრონული პარალელური კორპუსული გამოცემა"
              დაფინანსებულია შოთა რუსთაველის საქართველოს ეროვნული სამეცნიერო ფონდის ახალგაზრდა მეცნიერთა
              კვლევების 2019 წლის გრანტით (YS-19-165).
            </p>
            <p>
              პროექტის ფარგლებში მომზადდა ტობის წიგნის ქართული, ბერძნული და სომხური ვერსიების პარალელური
              ელექტრონული გამოცემა, რომელიც, ამავდროულად, იქნა ანოტირებული (თითოეულ სიტყვას მიეთითა ლემა,
              გრამატიკული ფორმა და ინგლისური თარგმანი).
            </p>
            <h3 className="text-xl font-bold mt-6">ტობის წიგნის ტექსტუალური ისტორია</h3>
            <p>
              ტობის წიგნი ბიბლიის იმ წიგნთაგანია, რომელიც ებრაულ კანონში არ შესულა. ბერძნულად ჩვენამდე
              ტობის წიგნმა სამი ტექსტუალური ფორმით მოაღწია.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">იტვირთება...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50" style={{ fontFamily: "'Noto Sans Georgian', sans-serif" }}>
      <Navigation />
      <main>
        {view === 'home' && <HomeView />}
        {view === 'manuscript' && <ManuscriptView />}
        {view === 'search' && <SearchView />}
        {view === 'about' && <AboutView />}
      </main>
    </div>
  );
};

export default App;
