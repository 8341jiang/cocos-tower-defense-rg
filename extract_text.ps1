$xmlPath = 'c:\Users\19067\Desktop\xxxxxx\t\cd\rg\document.xml'
$outputPath = 'c:\Users\19067\Desktop\xxxxxx\t\cd\rg\document_text.txt'

$xmlContent = Get-Content $xmlPath -Raw
$xml = [xml]$xmlContent

$ns = New-Object System.Xml.XmlNamespaceManager($xml.NameTable)
$ns.AddNamespace('w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main')

$styleMap = @{
    'Heading1' = 1
    'Heading2' = 2
    'Heading3' = 3
    'Heading4' = 4
    'Heading5' = 5
    'Heading6' = 6
}

function GetTextFromNode {
    param($node)
    $textElements = $node.SelectNodes('.//w:t', $ns)
    $text = ''
    foreach ($t in $textElements) {
        if ($null -ne $t.InnerText) {
            $text += $t.InnerText
        }
    }
    return $text
}

function IsAncestorOf {
    param($parent, $child)
    $node = $child.ParentNode
    while ($null -ne $node) {
        if ($node -eq $parent) { return $true }
        $node = $node.ParentNode
    }
    return $false
}

# First, collect all table rows and deduplicate
$tables = $xml.SelectNodes('//w:tbl', $ns)
$tableData = @()
$processedTrs = New-Object System.Collections.Generic.HashSet[System.String]

foreach ($tbl in $tables) {
    $rows = $tbl.SelectNodes('.//w:tr', $ns)
    foreach ($tr in $rows) {
        $rowKey = ''
        $cells = $tr.SelectNodes('.//w:tc', $ns)
        $cellTexts = @()
        foreach ($cell in $cells) {
            $cellText = GetTextFromNode $cell
            $cellText = $cellText.Trim()
            $cellTexts += $cellText
            $rowKey += $cellText + '|'
        }
        
        if ($rowKey.Trim() -ne '' -and -not $processedTrs.Contains($rowKey)) {
            $processedTrs.Add($rowKey) | Out-Null
            $tableData += ($cellTexts -join ' | ')
        }
    }
}

# Now process paragraphs
$paragraphs = $xml.SelectNodes('//w:p', $ns)
$outputLines = @()

foreach ($p in $paragraphs) {
    # Check if paragraph is inside a table
    $isInTable = $false
    foreach ($tbl in $tables) {
        if (IsAncestorOf $tbl $p) {
            $isInTable = $true
            break
        }
    }
    if ($isInTable) { continue }

    $paraText = GetTextFromNode $p
    if ($paraText.Trim() -eq '') { continue }

    # Check for page break
    $brElements = $p.SelectNodes('.//w:br', $ns)
    foreach ($br in $brElements) {
        $brType = $br.GetAttribute('w:type', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main')
        if ($brType -eq 'page') {
            $outputLines += ''
            $outputLines += '--- PAGE BREAK ---'
            $outputLines += ''
        }
    }

    # Get paragraph style
    $styleNode = $p.SelectSingleNode('./w:pPr/w:pStyle', $ns)
    $styleVal = ''
    if ($null -ne $styleNode) {
        $styleVal = $styleNode.GetAttribute('w:val', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main')
    }

    # Check for numbering (list items)
    $numNode = $p.SelectSingleNode('./w:pPr/w:numPr', $ns)
    $isListItem = $null -ne $numNode

    # Format based on style
    if ($styleMap.ContainsKey($styleVal)) {
        $level = $styleMap[$styleVal]
        $prefix = '#' * $level
        $outputLines += ''
        $outputLines += "$prefix $paraText"
        $outputLines += ''
    } elseif ($isListItem) {
        $outputLines += "  - $paraText"
    } else {
        $outputLines += $paraText
    }
}

# Add table data at the end
if ($tableData.Count -gt 0) {
    $outputLines += ''
    $outputLines += '================================================================'
    $outputLines += 'TABLE DATA (deduplicated)'
    $outputLines += '================================================================'
    $outputLines += ''
    $inHeader = $true
    foreach ($row in $tableData) {
        if ($inHeader) {
            $outputLines += $row
            $colCount = ($row -split '\|').Count
            $separator = ''
            for ($i = 0; $i -lt $colCount; $i++) {
                if ($i -gt 0) { $separator += ' | ' }
                $separator += '---'
            }
            $outputLines += $separator
            $inHeader = $false
        } else {
            $outputLines += $row
        }
    }
    $outputLines += ''
}

$output = $outputLines -join "`n"
$output | Out-File -FilePath $outputPath -Encoding utf8

Write-Host "Extracted text saved to $outputPath"
Write-Host "Total output lines: $($outputLines.Count)"
Write-Host "Total characters: $($output.Length)"
Write-Host "Table rows (deduplicated): $($tableData.Count)"
