function fixMermaidMarkerColors() {
  document
    .querySelectorAll("svg[aria-roledescription=flowchart-v2]")
    .forEach((svg) => {
      // Remember all of the new markers created for this SVG so that they
      // can be re-used.
      let newMarkers = new Set();
      svg.querySelectorAll("path").forEach((path) => {
        // skip the marker paths themselves
        if (path.parentElement.nodeName == "marker") {
          return;
        }
        // skip paths that have no markers
        if (
          !path.hasAttribute("marker-start") &&
          !path.hasAttribute("marker-end")
        ) {
          return;
        }
        let pathStroke = path.style.stroke;
        // skip paths that do not have a stroke set
        if ([undefined, "none"].includes(pathStroke)) {
          return;
        }
        // create a suffix for the marker ID from the stroke
        let markerSuffix = pathStroke.replace(/[\s,)(]/gi, "_");
        // inspect the markers currently assigned to this path
        ["marker-start", "marker-end"].forEach((markerPos) => {
          // paths may only have one marker, so skip if the one is not
          // assigned
          if (!path.hasAttribute(markerPos)) {
            return;
          }
          // get the ID of the old marker and retrieve it
          let oldMarkerID = path.getAttribute(markerPos).slice(4, -1);
          let oldMarker = svg.querySelector(oldMarkerID);
          // oldMarkerID is still a selector, so we get the ID without '#'
          oldMarkerID = oldMarker.id;

          // markers can have multiple paths (like the X marker), but we
          // assume they are all the same style, so we only look at the
          // first one to see if it already matches.
          let oldStroke = oldMarker.firstChild.style.stroke;
          // if the existing marker stroke already matches (or if it has no
          // stroke, but the fill matches), skip it, since it will already
          // match the line
          switch (oldStroke) {
            case pathStroke:
              return;
            case "none":
            case undefined:
              if (oldMarker.firstChild.style.fill == pathStroke) return;
          }
          // create new marker ID suffix from the current path's stroke
          // color.
          let newMarkerID = `${oldMarkerID}_${markerSuffix}`;
          // don't create a new marker if we've already made one for this
          // color.
          
          if (oldMarker.classList.contains("cross")) {
              pathStroke = 'red';
              shortenPath(path, oldMarker);
          }
          if (!newMarkers.has(newMarkerID)) {
            // deep clone the old marker so marker paths are cloned too.
            let newMarker = oldMarker.cloneNode(true);
            newMarker.id = newMarkerID;
            // modify all marker shapes to match the current path.
            newMarker
              .querySelectorAll(
                "path, rect, circle, ellipse, line, polyline, polygon"
              )
              .forEach((markerShape) => {
                let changed = false;
                ["fill", "stroke"].forEach((attr) => {
                  // only replace fill or stroke, don't add
                  if (
                    ![undefined, "none"].includes(markerShape.style[attr])
                  ) {
                    markerShape.style[attr] = pathStroke;
                    changed = true;
                  }
                });
                // if the old marker has neither fill nor stroke set, we
                // assign one depending on the svg element type.
                // Paths and lines get assigned "stroke", while every other
                // shape gets assigned "fill".
                if (!changed) {
                  let attr = "fill";
                  switch (markerShape.nodeName) {
                    case "path":
                    case "line":
                    case "polyline":
                      attr = "stroke";
                  }
                  markerShape.style[attr] = pathStroke;
                }
              });
            // place the new marker in the same container as the old one.
            oldMarker.parentElement.appendChild(newMarker);
            // Record the new colored marker so it can be re-used on other
            // paths with the same color.
            newMarkers.add(newMarkerID);
          }
          // Finally, update the path so that its marker URLs target the
          // new colored marker.
          path.setAttribute(markerPos, `url(#${newMarkerID})`);
        });
      });
    });
}
window.addEventListener('load', fixMermaidMarkerColors);

function shortenPath(path, marker) {
  const length = path.getTotalLength();
  const shortenFactor = 0.8;  // Adjust as needed to control path shortening
  const newLength = length * shortenFactor;

  // Apply stroke-dasharray to shorten the path
  path.style.strokeDasharray = `${newLength} ${length}`;
}
