$content = [System.IO.File]::ReadAllText("D:\weiyun\3240330932\project\brian-site\course-app\admin\reports.html", [System.Text.Encoding]::UTF8)
$idx = $content.IndexOf("innerHTML=(data.certificates")
$before = $content.Substring(0, $idx)
$afterIdx = $content.IndexOf(";", $idx + 200)
$after = $content.Substring($afterIdx)
$new = "innerHTML='';var frag=document.createDocumentFragment();(data.certificates||[]).forEach(function(c){var tr=document.createElement('tr');var td1=document.createElement('td');td1.textContent=c.student_id;tr.appendChild(td1);var td2=document.createElement('td');td2.textContent=c.course_id;tr.appendChild(td2);var td3=document.createElement('td');td3.textContent=c.status;tr.appendChild(td3);var td4=document.createElement('td');if(c.status==='pending'){var btn1=document.createElement('button');btn1.className='btn';btn1.dataset.id=c.id;btn1.dataset.action='approve';btn1.textContent='批准';td4.appendChild(btn1);td4.appendChild(document.createTextNode(' '));var btn2=document.createElement('button');btn2.className='btn';btn2.dataset.id=c.id;btn2.dataset.action='reject';btn2.textContent='拒绝';td4.appendChild(btn2);}else{td4.textContent='-';}tr.appendChild(td4);frag.appendChild(tr);});document.getElementById('cert-list').appendChild(frag);"
$newContent = $before + $new + $after
[System.IO.File]::WriteAllText("D:\weiyun\3240330932\project\brian-site\course-app\admin\reports.html", $newContent, [System.Text.Encoding]::UTF8)
Write-Host "Done"
